/**
 * A context for tests: in-memory database, settable clock, fake LLM, and
 * optional fake Google clients. Returns the owner's context (what services
 * and tools take); `ctx.app` is the whole-server one.
 * Time defaults to 14:00 Toronto on 2026-10-29.
 */
const { openDatabase } = require("../../services/db/database");
const { createContext } = require("../../services/context");
const { createFakeLlm } = require("./fakeLlm");

const TEST_CONFIG = {
  timezone: "America/Toronto",
  followUpDays: 7,
  reminderHour: 9,
  digestHour: 9,
  nudgeHour: 20,
  agentMaxTurns: 10,
  userName: "Mit",
  userPitch: "",
  appUrl: "http://localhost:5173",
  clientOrigins: ["http://localhost:5173"],
  google: { clientId: "", clientSecret: "", redirectUri: "http://localhost:5000/auth/google/callback", calendarId: "primary" },
  appSecret: "test-secret",
  allowedHosts: [],
};

function createTestContext({ llm = createFakeLlm(), calendar = null, mailer = null, gmail = null, now = "2026-10-29T18:00:00Z", config = {} } = {}) {
  const clock = { now: new Date(now) };
  const app = createContext({
    db: openDatabase(":memory:"),
    llm,
    config: { ...TEST_CONFIG, ...config },
    clock: () => clock.now,
    connectors: { forUser: () => ({ calendar, mailer, gmail }), forget() {} },
  });

  const published = [];
  app.events.on("event", (event) => published.push(event));

  const ctx = app.forUser(app.users.update(app.users.owner().id, { email: "mit@example.com" }));
  /** Moves the test clock. */
  ctx.setNow = (value) => {
    clock.now = new Date(value);
  };
  ctx.published = published;
  return ctx;
}

/** Records calls like the Google Calendar client; `failWith` makes every call throw. */
function createFakeCalendar({ failWith } = {}) {
  const calls = [];
  let nextId = 1;
  const record = (name, payload) => {
    calls.push({ name, ...payload });
    if (failWith) throw new Error(failWith);
  };

  return {
    calls,
    async createEvent(event) {
      record("create", { event });
      return `event-${nextId++}`;
    },
    async updateEvent(eventId, event) {
      record("update", { eventId, event });
    },
    async deleteEvent(eventId) {
      record("delete", { eventId });
    },
  };
}

function createFakeMailer({ failWith } = {}) {
  const sent = [];
  return {
    sent,
    async send(mail) {
      if (failWith) throw new Error(failWith);
      sent.push(mail);
    },
  };
}

/** Like the user's Gmail client: drafts are recorded; `inbox` holds message summaries to find. */
function createFakeGmail({ inbox = [] } = {}) {
  const drafts = [];
  const queries = [];
  return {
    drafts,
    queries,
    inbox,
    async createDraft(mail) {
      drafts.push(mail);
      return `draft-${drafts.length}`;
    },
    async listMessageIds(query) {
      queries.push(query);
      const from = (query.match(/from:\(([^)]*)\)/)?.[1] ?? "").split(" OR ").map((email) => email.toLowerCase());
      return inbox.filter((message) => from.some((email) => message.from.toLowerCase().includes(email))).map((message) => message.id);
    },
    async getMessageSummary(id) {
      return inbox.find((message) => message.id === id);
    },
  };
}

module.exports = { createTestContext, createFakeCalendar, createFakeMailer, createFakeGmail, TEST_CONFIG };
