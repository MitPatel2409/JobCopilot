const { one, setClause, nowIso } = require("../database");

const EDITABLE = [
  "email",
  "name",
  "pitch",
  "timezone",
  "reminder_hour",
  "digest_hour",
  "nudge_hour",
  "follow_up_days",
  "digest_enabled",
  "google_client_id",
  "google_client_secret",
  "resume_folder",
  "resume_auto_attach",
];

/**
 * The person using Job-Copilot. It is a single-user app: there is one row,
 * the owner, holding their settings. (The other tables still carry a
 * user_id, which is always the owner's.)
 */
function createUsersRepo(db) {
  const insert = db.prepare("INSERT INTO users (email, created_at) VALUES ('', ?)");
  const byId = db.prepare("SELECT * FROM users WHERE id = ?");
  const first = db.prepare("SELECT * FROM users ORDER BY id LIMIT 1");

  function get(id) {
    return one(byId, id);
  }

  return {
    get,

    /** The owner, made on first start. */
    owner() {
      const existing = one(first);
      if (existing) return existing;
      insert.run(nowIso());
      return one(first);
    },

    update(id, fields) {
      const { sql, values } = setClause(fields, EDITABLE);
      if (sql) db.prepare(`UPDATE users SET ${sql} WHERE id = ?`).run(...values, id);
      return get(id);
    },
  };
}

module.exports = { createUsersRepo };
