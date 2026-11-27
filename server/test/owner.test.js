const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext, TEST_CONFIG } = require("./helpers/testContext");
const { startServer, cookieFrom } = require("./helpers/server");
const { createFakeLlm } = require("./helpers/fakeLlm");
const { openDatabase } = require("../services/db/database");
const { createContext } = require("../services/context");
const { createTokenVault } = require("../services/auth/tokenVault");
const { CONNECTORS } = require("../services/auth/googleOAuth");
const { createGoogleConnectors } = require("../services/google/connectors");

/** Stands in for Google: each code maps to the account that consented and what it granted. */
function useFakeGoogle(ctx, accounts) {
  ctx.app.oauth = {
    configured: true,
    connectUrl: (state, connector) => `https://accounts.example/connect?state=${state}&c=${connector}`,
    async exchange(code) {
      const account = accounts[code];
      if (!account) throw new Error("bad code");
      return {
        tokens: { refresh_token: account.refreshToken ?? null },
        scopes: account.scopes ?? ["openid"],
        profile: { sub: account.sub ?? "g", email: account.email, name: account.name ?? null, picture: null },
      };
    },
    revoked: [],
    async revoke(token) {
      this.revoked.push(token);
    },
  };
}

/** Starts the redirect to Google and returns the state and the cookie carrying it. */
async function goToGoogle(request, connector) {
  const response = await request(`/auth/google/connect/${connector}`);
  assert.equal(response.status, 302);
  const state = new URL(response.headers.get("location")).searchParams.get("state");
  return { state, cookie: `jc_oauth=${encodeURIComponent(cookieFrom(response.headers, "jc_oauth"))}` };
}

test("there is no sign-in: the app opens as its one owner", async (t) => {
  const ctx = createTestContext();
  const request = await startServer(t, ctx);
  assert.equal((await request("/today")).status, 200);
  assert.equal((await request("/profile")).json.user.email, "mit@example.com");
  assert.equal((await request("/auth/me")).status, 404, "the sign-in routes are gone");
});

test("the owner is made on first start and kept after", () => {
  const db = openDatabase(":memory:");
  const app = createContext({ db, llm: createFakeLlm(), config: TEST_CONFIG, connectors: null });
  const owner = app.users.owner();
  assert.equal(app.users.owner().id, owner.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM users").get().c, 1);
});

test("requests from another site or under another host name are refused", async (t) => {
  const ctx = createTestContext();
  const request = await startServer(t, ctx);

  const evil = await request("/applications", { method: "POST", body: { company: "X" }, headers: { Origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  assert.equal(await request.withHost("/today", "evil.example"), 403);
  assert.equal(await request.withHost("/today", "localhost:5000"), 200);
  const ours = await request("/applications", { method: "POST", body: { company: "X" }, headers: { Origin: "http://localhost:5173" } });
  assert.equal(ours.status, 201);
});

test("the server's own public name, from GOOGLE_REDIRECT_URI, is allowed", async (t) => {
  const ctx = createTestContext({ config: { allowedHosts: ["copilot.example.com"] } });
  const request = await startServer(t, ctx);
  assert.equal(await request.withHost("/today", "copilot.example.com"), 200);
});

test("connecting a Google service saves an encrypted token and the account's email", async (t) => {
  const ctx = createTestContext();
  ctx.app.users.update(ctx.user.id, { email: "", name: null });
  useFakeGoogle(ctx, {
    cal: { email: "mit@gmail.com", name: "Mit", refreshToken: "refresh-123", scopes: ["openid", CONNECTORS.calendar.scope] },
    send: { email: "mit@gmail.com", refreshToken: "refresh-456", scopes: ["openid", CONNECTORS.calendar.scope, CONNECTORS.gmail_send.scope] },
    other: { email: "other@gmail.com", refreshToken: "refresh-789", scopes: ["openid", CONNECTORS.gmail_drafts.scope] },
  });
  const request = await startServer(t, ctx);

  let trip = await goToGoogle(request, "calendar");
  let back = await request(`/auth/google/callback?code=cal&state=${trip.state}`, { headers: { Cookie: trip.cookie } });
  assert.equal(back.headers.get("location"), "http://localhost:5173/?connected=calendar");

  const stored = ctx.app.googleTokens.get(ctx.user.id);
  assert.notEqual(stored.refresh_token, "refresh-123", "stored encrypted");
  assert.equal(ctx.app.vault.decrypt(stored.refresh_token), "refresh-123");
  assert.equal(ctx.app.users.get(ctx.user.id).email, "mit@gmail.com");
  assert.equal(ctx.app.users.get(ctx.user.id).name, "Mit");

  trip = await goToGoogle(request, "gmail_send");
  await request(`/auth/google/callback?code=send&state=${trip.state}`, { headers: { Cookie: trip.cookie } });
  assert.deepEqual(ctx.app.googleTokens.get(ctx.user.id).enabled, ["calendar", "gmail_send"]);

  const listed = await request("/connectors");
  assert.equal(listed.json.account, "mit@gmail.com");
  assert.deepEqual(listed.json.connectors.filter((c) => c.connected).map((c) => c.id), ["calendar", "gmail_send"]);

  trip = await goToGoogle(request, "gmail_drafts");
  await request(`/auth/google/callback?code=other&state=${trip.state}`, { headers: { Cookie: trip.cookie } });
  assert.deepEqual(ctx.app.googleTokens.get(ctx.user.id).enabled, ["gmail_drafts"], "another account replaces the old one");
});

test("the callback refuses a state that does not match", async (t) => {
  const ctx = createTestContext();
  useFakeGoogle(ctx, { cal: { email: "mit@gmail.com", refreshToken: "r", scopes: [CONNECTORS.calendar.scope] } });
  const request = await startServer(t, ctx);

  const { cookie } = await goToGoogle(request, "calendar");
  const back = await request("/auth/google/callback?code=cal&state=forged", { headers: { Cookie: cookie } });
  assert.equal(back.headers.get("location"), "http://localhost:5173/?connect_error=expired");
  assert.equal(ctx.app.googleTokens.get(ctx.user.id), null);
});

test("disconnecting the last service revokes Google's access", async (t) => {
  const ctx = createTestContext();
  useFakeGoogle(ctx, {});
  ctx.app.googleTokens.save(ctx.user.id, { refreshToken: ctx.app.vault.encrypt("refresh-123"), scopes: [CONNECTORS.calendar.scope], enabled: ["calendar"] });
  const request = await startServer(t, ctx);

  assert.equal((await request("/connectors/calendar", { method: "DELETE" })).status, 204);
  assert.equal(ctx.app.googleTokens.get(ctx.user.id), null);
  assert.deepEqual(ctx.app.oauth.revoked, ["refresh-123"]);
});

test("the owner's Google clients follow the services turned on", () => {
  const ctx = createTestContext({ config: { google: { clientId: "id", clientSecret: "secret", redirectUri: "http://x", calendarId: "primary" } } });
  const vault = createTokenVault("test-secret");
  const connectors = createGoogleConnectors({ getGoogle: () => ctx.app.config.google, googleTokens: ctx.app.googleTokens, vault });
  const save = (enabled, scopes) => ctx.app.googleTokens.save(ctx.user.id, { refreshToken: vault.encrypt("r"), scopes, enabled });

  assert.deepEqual(connectors.forUser(ctx.user, ctx), {}, "nothing connected");

  save(["calendar", "gmail_drafts"], [CONNECTORS.calendar.scope, CONNECTORS.gmail_drafts.scope]);
  let clients = connectors.forUser(ctx.user, ctx);
  assert.equal(typeof clients.calendar.createEvent, "function");
  assert.equal(typeof clients.gmail.createDraft, "function");
  assert.equal(clients.gmail.listMessageIds, null, "reading mail was not turned on");
  assert.equal(clients.mailer, null);

  save(["gmail_send"], []); // turned on, but Google did not grant the permission
  connectors.forget(ctx.user.id);
  assert.equal(connectors.forUser(ctx.user, ctx).mailer, null);

  save(["gmail_send"], [CONNECTORS.gmail_send.scope]);
  ctx.app.googleTokens.markBroken(ctx.user.id, "revoked");
  clients = connectors.forUser(ctx.user, ctx);
  assert.deepEqual(clients, {}, "a token Google refused is not used");
});

test("the token vault round-trips and rejects tampering", () => {
  const vault = createTokenVault("secret");
  const sealed = vault.encrypt("1//refresh");
  assert.equal(vault.decrypt(sealed), "1//refresh");
  const tampered = Buffer.from(sealed, "base64");
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => vault.decrypt(tampered.toString("base64")));
  assert.throws(() => createTokenVault("other").decrypt(sealed));
});

test("a Google client pasted into Settings works at once, stored encrypted; .env wins when set", async (t) => {
  const ctx = createTestContext();
  const request = await startServer(t, ctx);

  let setup = await request("/google/setup");
  assert.equal(setup.json.configured, false);
  assert.equal(setup.json.redirectUri, "http://localhost:5000/auth/google/callback");
  assert.equal((await request("/auth/google/connect?services=calendar")).headers.get("location"), "http://localhost:5173/?connect_error=not_configured");

  const bad = await request("/google/setup", { method: "PUT", body: { client_id: "not-a-client", client_secret: "GOCSPX-abcdefghij" } });
  assert.equal(bad.status, 400);

  setup = await request("/google/setup", { method: "PUT", body: { client_id: "123-abc.apps.googleusercontent.com", client_secret: "GOCSPX-secret-value" } });
  assert.equal(setup.json.configured, true);
  assert.equal(setup.json.source, "app");
  const stored = ctx.app.users.get(ctx.user.id).google_client_secret;
  assert.notEqual(stored, "GOCSPX-secret-value", "stored encrypted");
  assert.equal(ctx.app.google().clientSecret, "GOCSPX-secret-value");

  const go = await request("/auth/google/connect?services=calendar,gmail_send");
  const url = new URL(go.headers.get("location"));
  assert.equal(url.hostname, "accounts.google.com");
  assert.equal(url.searchParams.get("client_id"), "123-abc.apps.googleusercontent.com");
  assert.match(url.searchParams.get("scope"), /calendar\.events.*gmail\.send/);

  assert.equal((await request("/google/setup", { method: "DELETE" })).status, 204);
  assert.equal((await request("/google/setup")).json.configured, false);

  const fromEnv = createTestContext({ config: { google: { clientId: "env.apps.googleusercontent.com", clientSecret: "x", redirectUri: "http://localhost:5000/auth/google/callback", calendarId: "primary" } } });
  const envRequest = await startServer(t, fromEnv);
  assert.equal((await envRequest("/google/setup")).json.source, "env");
  assert.equal((await envRequest("/google/setup", { method: "PUT", body: { client_id: "a.apps.googleusercontent.com", client_secret: "GOCSPX-1234567890" } })).status, 400);
});

test("one consent screen connects several services; ones Google wasn't granted are left off", async (t) => {
  const ctx = createTestContext();
  ctx.app.users.update(ctx.user.id, { email: "" });
  useFakeGoogle(ctx, {
    some: { email: "mit@gmail.com", refreshToken: "r-1", scopes: ["openid", CONNECTORS.calendar.scope, CONNECTORS.gmail_drafts.scope] },
  });
  const request = await startServer(t, ctx);

  const go = await request("/auth/google/connect?services=calendar,gmail_drafts,gmail_read");
  const state = new URL(go.headers.get("location")).searchParams.get("state");
  const cookie = `jc_oauth=${encodeURIComponent(cookieFrom(go.headers, "jc_oauth"))}`;
  const back = await request(`/auth/google/callback?code=some&state=${state}`, { headers: { Cookie: cookie } });
  assert.equal(back.headers.get("location"), "http://localhost:5173/?connected=calendar%2Cgmail_drafts");
  assert.deepEqual(ctx.app.googleTokens.get(ctx.user.id).enabled, ["calendar", "gmail_drafts"]);

  assert.equal((await request("/auth/google/connect?services=calendar,nope")).headers.get("location"), "http://localhost:5173/?connect_error=unknown");
});

test("Settings warns when Google Calendar shows another timezone than the app", async (t) => {
  const zoneOf = (timeZone) => ({ createEvent: async () => "e", updateEvent: async () => {}, deleteEvent: async () => {}, timeZone: async () => timeZone });

  const utc = createTestContext({ calendar: zoneOf("UTC") });
  const request = await startServer(t, utc);
  assert.deepEqual((await request("/connectors")).json.calendarTimeZone, { calendar: "UTC", app: "America/Toronto" });

  const sameClock = createTestContext({ calendar: zoneOf("America/New_York") });
  const request2 = await startServer(t, sameClock);
  assert.equal((await request2("/connectors")).json.calendarTimeZone, null, "a zone with the same clock time is fine");

  const failing = createTestContext({ calendar: { ...zoneOf(""), timeZone: async () => { throw new Error("quota"); } } });
  const request3 = await startServer(t, failing);
  const listed = await request3("/connectors");
  assert.equal(listed.status, 200);
  assert.equal(listed.json.calendarTimeZone, null);
});
