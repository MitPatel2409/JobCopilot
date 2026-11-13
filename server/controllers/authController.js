/**
 * Connecting a Google service (Settings → Connect). There is no sign-in:
 * this only asks Google for one permission and stores the token it gives.
 *
 * The trip goes to Google and comes back to GET /auth/google/callback. A
 * short-lived cookie carries a random `state` (checked against the one
 * Google returns) and which service it was for.
 */
const crypto = require("node:crypto");
const { CONNECTORS } = require("../services/auth/googleOAuth");
const { parseCookies, setCookie, clearCookie } = require("../utils/cookies");

const STATE_COOKIE = "jc_oauth";
const STATE_SECONDS = 10 * 60;

exports.connect = (req, res) => {
  const app = req.app.locals.app;
  const connector = req.params.connector;
  if (!CONNECTORS[connector]) return backToApp(res, app, { connect_error: "unknown" });
  if (!app.oauth.configured || !app.vault) return backToApp(res, app, { connect_error: "not_configured" });

  const state = crypto.randomBytes(16).toString("base64url");
  setCookie(res, STATE_COOKIE, `${state}:${connector}`, { maxAgeSeconds: STATE_SECONDS, path: "/auth" });
  res.redirect(app.oauth.connectUrl(state, connector));
};

exports.callback = async (req, res) => {
  const app = req.app.locals.app;
  const [state, connector] = (parseCookies(req.get("Cookie"))[STATE_COOKIE] ?? "").split(":");
  clearCookie(res, STATE_COOKIE, { path: "/auth" });

  if (!state || state !== req.query.state || !CONNECTORS[connector]) return backToApp(res, app, { connect_error: "expired" });
  if (req.query.error) return backToApp(res, app, { connect_error: req.query.error === "access_denied" ? "denied" : "failed" });

  try {
    const { tokens, scopes, profile } = await app.oauth.exchange(String(req.query.code ?? ""));
    if (!scopes.includes(CONNECTORS[connector].scope)) return backToApp(res, app, { connect_error: "denied" });
    if (!tokens.refresh_token) return backToApp(res, app, { connect_error: "failed" });

    const owner = req.user;
    const previous = app.googleTokens.get(owner.id);
    // Connecting a different Google account replaces the old one and the services turned on for it.
    const sameAccount = previous && owner.email === profile.email;
    app.googleTokens.save(owner.id, {
      refreshToken: app.vault.encrypt(tokens.refresh_token),
      scopes,
      enabled: [...new Set([...(sameAccount ? previous.enabled : []), connector])],
    });
    app.users.update(owner.id, { email: profile.email, name: owner.name ?? profile.name });
    app.connectors?.forget(owner.id);
    backToApp(res, app, { connected: connector });
  } catch (error) {
    console.error("Connecting Google failed:", error.message);
    backToApp(res, app, { connect_error: "failed" });
  }
};

function backToApp(res, app, params) {
  const url = new URL(app.config.appUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  res.redirect(url.toString());
}
