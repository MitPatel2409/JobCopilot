const { one, all, setClause, nowIso } = require("../database");

const EDITABLE = ["name", "title", "linkedin_url", "email"];

function createContactsRepo(db, userId) {
  const insert = db.prepare(`
    INSERT INTO contacts (user_id, application_id, name, title, linkedin_url, email, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const byId = db.prepare("SELECT * FROM contacts WHERE id = ? AND user_id = ?");
  const byApplication = db.prepare("SELECT * FROM contacts WHERE application_id = ? AND user_id = ? ORDER BY id");
  const withEmail = db.prepare("SELECT * FROM contacts WHERE user_id = ? AND email IS NOT NULL AND email != '' ORDER BY id");
  const remove = db.prepare("DELETE FROM contacts WHERE id = ? AND user_id = ?");

  function get(id) {
    return one(byId, id, userId);
  }

  return {
    get,

    create({ applicationId = null, name, title = "", linkedinUrl = null, email = null }) {
      const { lastInsertRowid } = insert.run(userId, applicationId, name, title, linkedinUrl, email, nowIso());
      return get(Number(lastInsertRowid));
    },

    update(id, fields) {
      const { sql, values } = setClause(fields, EDITABLE);
      if (sql) db.prepare(`UPDATE contacts SET ${sql} WHERE id = ? AND user_id = ?`).run(...values, id, userId);
      return get(id);
    },

    listByApplication(applicationId) {
      return all(byApplication, applicationId, userId);
    },

    /** Every contact with an email address, for the reply watcher. */
    listWithEmail() {
      return all(withEmail, userId);
    },

    delete(id) {
      remove.run(id, userId);
    },
  };
}

module.exports = { createContactsRepo };
