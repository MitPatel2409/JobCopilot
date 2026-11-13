const { one, nowIso } = require("../database");

function parse(row) {
  return row && { ...row, scopes: row.scopes ? row.scopes.split(" ") : [], enabled: JSON.parse(row.enabled) };
}

/** Each user's Google connection. `refresh_token` arrives and leaves encrypted (services/auth/tokenVault.js). */
function createGoogleTokensRepo(db) {
  const byUser = db.prepare("SELECT * FROM google_tokens WHERE user_id = ?");
  const upsert = db.prepare(`
    INSERT INTO google_tokens (user_id, refresh_token, scopes, enabled, last_error, updated_at) VALUES (?, ?, ?, ?, NULL, ?)
    ON CONFLICT (user_id) DO UPDATE SET
      refresh_token = excluded.refresh_token, scopes = excluded.scopes, enabled = excluded.enabled,
      last_error = NULL, updated_at = excluded.updated_at`);
  const setEnabled = db.prepare("UPDATE google_tokens SET enabled = ?, updated_at = ? WHERE user_id = ?");
  const setError = db.prepare("UPDATE google_tokens SET last_error = ?, updated_at = ? WHERE user_id = ?");
  const remove = db.prepare("DELETE FROM google_tokens WHERE user_id = ?");

  return {
    get(userId) {
      return parse(one(byUser, userId));
    },

    save(userId, { refreshToken, scopes, enabled }) {
      upsert.run(userId, refreshToken, scopes.join(" "), JSON.stringify(enabled), nowIso());
      return this.get(userId);
    },

    setEnabled(userId, enabled) {
      setEnabled.run(JSON.stringify(enabled), nowIso(), userId);
      return this.get(userId);
    },

    /** Google refused the token (revoked, or expired after 7 days while the app is in testing). */
    markBroken(userId, message) {
      setError.run(message, nowIso(), userId);
    },

    delete(userId) {
      remove.run(userId);
    },
  };
}

module.exports = { createGoogleTokensRepo };
