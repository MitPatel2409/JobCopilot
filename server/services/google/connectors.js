/**
 * Builds a user's Google clients from their stored token and the connectors
 * they turned on in Settings:
 *
 *   calendar      reminders become calendar events (reminderService)
 *   mailer        the daily digest, sent from and to the user's own Gmail
 *   gmail         { createDraft } and/or { listMessageIds, getMessageSummary }
 *
 * Anything not turned on is null, which every caller already treats as "off".
 * When Google refuses the token, the connection is marked broken so Settings
 * can ask the user to reconnect.
 */
const { CONNECTORS, createOAuthClient } = require("../auth/googleOAuth");
const { createGoogleCalendar } = require("../calendar/googleCalendar");
const { createGmailClient } = require("../gmail/gmailClient");

/** `getGoogle()` gives the current OAuth client settings (from .env or Settings). */
function createGoogleConnectors({ getGoogle, googleTokens, vault }) {
  // Clients are reused while the stored token is unchanged, so Google is not
  // asked for a new access token on every request.
  const cache = new Map();

  function forUser(user, ctx) {
    const google = getGoogle();
    if (!google.clientId || !google.clientSecret) return {};
    const token = googleTokens.get(user.id);
    if (!token || token.last_error) return {};

    const key = `${google.clientId}|${token.updated_at}|${ctx.config.timezone}`;
    const cached = cache.get(user.id);
    if (cached?.key === key) return cached.clients;

    const clients = build(user, token, ctx.config.timezone, google);
    cache.set(user.id, { key, clients });
    return clients;
  }

  function build(user, token, timeZone, google) {
    const oauth = createOAuthClient(google);
    oauth.setCredentials({ refresh_token: vault.decrypt(token.refresh_token) });
    const on = (name) => token.enabled.includes(name) && token.scopes.includes(CONNECTORS[name].scope);
    const guard = (fn) => watchForRevokedToken(fn, () => googleTokens.markBroken(user.id, "Google no longer accepts this connection."));

    const gmail = on("gmail_send") || on("gmail_drafts") || on("gmail_read") ? createGmailClient(oauth) : null;
    const calendar = on("calendar") ? createGoogleCalendar(oauth, { calendarId: google.calendarId, timeZone }) : null;

    return {
      calendar: calendar && {
        createEvent: guard(calendar.createEvent),
        updateEvent: guard(calendar.updateEvent),
        deleteEvent: guard(calendar.deleteEvent),
        timeZone: guard(calendar.timeZone),
      },
      mailer: on("gmail_send") ? { send: guard((mail) => gmail.sendMessage({ ...mail, to: user.email })) } : null,
      gmail:
        on("gmail_drafts") || on("gmail_read")
          ? {
              createDraft: on("gmail_drafts") ? guard(gmail.createDraft) : null,
              listMessageIds: on("gmail_read") ? guard(gmail.listMessageIds) : null,
              getMessageSummary: on("gmail_read") ? guard(gmail.getMessageSummary) : null,
            }
          : null,
    };
  }

  return {
    forUser,
    /** Drops the cached clients after the token or the enabled list changed. */
    forget(userId) {
      cache.delete(userId);
    },
  };
}

/** Passes calls through; an "invalid_grant" from Google runs `onRevoked` before the error goes on. */
function watchForRevokedToken(fn, onRevoked) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error?.response?.data?.error === "invalid_grant" || error?.message === "invalid_grant") onRevoked();
      throw error;
    }
  };
}

module.exports = { createGoogleConnectors };
