/**
 * Every setting the server reads from the environment, in one place.
 * Other modules get these through `ctx.config` instead of reading process.env,
 * so tests can pass their own settings.
 */
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ quiet: true });

function readPositiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** An hour of the day (0-23), for the reminder, digest and nudge times. */
function readHour(name, fallback) {
  const raw = process.env[name];
  const value = Number(raw);
  return raw !== undefined && raw !== "" && Number.isInteger(value) && value >= 0 && value <= 23 ? value : fallback;
}

module.exports = {
  port: readPositiveNumber("PORT", 5000),

  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  geminiTimeoutMs: readPositiveNumber("GEMINI_TIMEOUT_MS", 30000),

  // Comma-separated, e.g. "http://localhost:5173,https://my-app.vercel.app"
  clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim()),

  // Upper bound on model round-trips for one chat message (cost and loop guard).
  agentMaxTurns: readPositiveNumber("AGENT_MAX_TURNS", 12),

  // Defaults; each can be changed in Settings.
  // Used in the agent's prompt and to sign outreach drafts.
  userName: process.env.USER_NAME || "",
  // One or two sentences about you, so outreach drafts are specific.
  userPitch: process.env.USER_PITCH || "",

  // Every date the user says ("today", "next Friday") is read in this timezone.
  timezone: process.env.APP_TIMEZONE || "America/Toronto",
  followUpDays: readPositiveNumber("FOLLOW_UP_DAYS", 7),
  reminderHour: readHour("REMINDER_HOUR", 9),
  digestHour: readHour("DIGEST_HOUR", 9),
  nudgeHour: readHour("NUDGE_HOUR", 20),

  // Folder where the tailored résumés are saved; new files in it are offered
  // for the matching application. Can be changed in Settings.
  resumeFolder: process.env.RESUME_FOLDER || "",

  dbPath: process.env.DB_PATH || path.join(__dirname, "..", "data", "copilot.db"),

  // Google connectors (Calendar, Gmail), linked from Settings. Needs an OAuth
  // client of type "Web application" whose redirect URI is GOOGLE_REDIRECT_URI.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/auth/google/callback",
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
  },

  // Encrypts the Google tokens stored in the database. When unset, one is
  // generated into server/data/secret.key on first start.
  appSecret: process.env.APP_SECRET || "",
  secretPath: path.join(__dirname, "..", "data", "secret.key"),

  // There is no sign-in, so the server only listens on this computer.
  // Set HOST=0.0.0.0 only behind something that does its own sign-in.
  host: process.env.HOST || "loopback",
  // Host names (besides localhost) this server answers to, e.g. its public name when deployed.
  allowedHosts: [
    ...new Set([
      hostnameOf(process.env.GOOGLE_REDIRECT_URI),
      ...(process.env.ALLOWED_HOSTS || "").split(","),
    ].map((name) => (name || "").trim().toLowerCase()).filter(Boolean)),
  ],

  // Set by `npm start` (scripts/start.js): stop when the launcher is gone, so
  // closing its window never leaves the server running in the background.
  exitWithParent: process.env.EXIT_WITH_PARENT === "1",

  // Link put in calendar events and the digest email.
  appUrl: process.env.APP_URL || "http://localhost:5173",
};
