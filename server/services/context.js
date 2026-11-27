/**
 * Built once at start-up: what the whole server shares. Tests build their own
 * with an in-memory database, a fake LLM and a fixed clock.
 *
 *   db, llm, clock, events     shared by everyone
 *   config                     server settings (config/env.js shape)
 *   users, googleTokens        the owner's settings and Google connection
 *   google()                   the Google OAuth client settings: .env first, else pasted in Settings
 *   oauth, vault, connectors   Google consent, token encryption, and the owner's Google clients
 *   forUser(user)              everything requests, tools and loops need (always the owner)
 *
 * forUser returns the `ctx` that services, tools and controllers take:
 *
 *   store     that user's repositories (services/db/store.js)
 *   config    server settings with the user's own name, timezone and hours on top
 *   calendar  { createEvent, updateEvent, deleteEvent } or null
 *   mailer    { send } for the digest, or null
 *   gmail     { createDraft, listMessageIds, getMessageSummary } (each may be null), or null
 *   today()   today's local date in the user's timezone
 *   publish() pushes an event to that user's open browser tabs (GET /events)
 */
const { EventEmitter } = require("node:events");
const { createStore } = require("./db/store");
const { createUsersRepo } = require("./db/repos/users");
const { createGoogleTokensRepo } = require("./db/repos/googleTokens");
const { createGoogleOAuth } = require("./auth/googleOAuth");
const { createTokenVault } = require("./auth/tokenVault");
const { createGoogleConnectors } = require("./google/connectors");
const { localDate } = require("../utils/time");

/** `connectors` replaces the real Google clients (tests pass fakes). */
function createContext({ db, llm, config, clock = () => new Date(), connectors }) {
  const events = new EventEmitter();
  events.setMaxListeners(100); // one listener per open browser tab

  const app = {
    db,
    llm,
    config,
    clock,
    events,
    users: createUsersRepo(db),
    googleTokens: createGoogleTokensRepo(db),
    vault: config.appSecret ? createTokenVault(config.appSecret) : null,
    connectors: null,

    /**
     * The Google OAuth client to use: GOOGLE_CLIENT_ID/SECRET from .env when
     * set (source "env"), else the one pasted into Settings (source "app").
     */
    google() {
      if (config.google.clientId && config.google.clientSecret) return { ...config.google, source: "env" };
      const owner = app.users.owner();
      if (owner.google_client_id && owner.google_client_secret && app.vault) {
        return { ...config.google, clientId: owner.google_client_id, clientSecret: app.vault.decrypt(owner.google_client_secret), source: "app" };
      }
      return { ...config.google, clientId: "", clientSecret: "", source: null };
    },

    forUser(user) {
      const userConfig = settingsFor(config, user);
      const ctx = {
        app,
        user,
        store: createStore(db, user.id),
        llm,
        config: userConfig,
        clock,
        events,
        calendar: null,
        mailer: null,
        gmail: null,
        today: () => localDate(clock(), userConfig.timezone),
        publish: (event) => events.emit("event", { ...event, userId: user.id }),
      };
      if (app.connectors) Object.assign(ctx, app.connectors.forUser(user, ctx));
      return ctx;
    },
  };
  app.oauth = createGoogleOAuth(() => app.google());
  app.connectors =
    connectors !== undefined
      ? connectors
      : app.vault
        ? createGoogleConnectors({ getGoogle: () => app.google(), googleTokens: app.googleTokens, vault: app.vault })
        : null;
  return app;
}

/** A user's own settings over the server defaults; a NULL column keeps the default. */
function settingsFor(config, user) {
  const own = (value, fallback) => (value === null || value === undefined ? fallback : value);
  return {
    ...config,
    userName: own(user.name, config.userName),
    userPitch: own(user.pitch, config.userPitch),
    userEmail: user.email,
    timezone: own(user.timezone, config.timezone),
    reminderHour: own(user.reminder_hour, config.reminderHour),
    digestHour: own(user.digest_hour, config.digestHour),
    nudgeHour: own(user.nudge_hour, config.nudgeHour),
    followUpDays: own(user.follow_up_days, config.followUpDays),
    digestEnabled: user.digest_enabled !== 0,
    resumeFolder: own(user.resume_folder, config.resumeFolder) || "",
    resumeAutoAttach: user.resume_auto_attach === 1,
  };
}

module.exports = { createContext, settingsFor };
