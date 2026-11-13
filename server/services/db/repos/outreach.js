const { one, all, setClause, nowIso } = require("../database");

const EDITABLE = ["subject", "body", "status", "sent_on", "channel", "contact_id", "gmail_draft_id"];

const SELECT = `
  SELECT o.*, c.name AS contact_name, c.email AS contact_email, c.linkedin_url AS contact_linkedin
  FROM outreach o LEFT JOIN contacts c ON c.id = o.contact_id`;

function createOutreachRepo(db, userId) {
  const insert = db.prepare(`
    INSERT INTO outreach (user_id, application_id, contact_id, channel, subject, body, status, sent_on, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const byId = db.prepare(`${SELECT} WHERE o.id = ? AND o.user_id = ?`);
  const byApplication = db.prepare(`${SELECT} WHERE o.application_id = ? AND o.user_id = ? ORDER BY o.id`);
  const remove = db.prepare("DELETE FROM outreach WHERE id = ? AND user_id = ?");

  function get(id) {
    return one(byId, id, userId);
  }

  return {
    get,

    create({ applicationId = null, contactId = null, channel = "email", subject = "", body, status = "draft", sentOn = null }) {
      const now = nowIso();
      const { lastInsertRowid } = insert.run(userId, applicationId, contactId, channel, subject, body, status, sentOn, now, now);
      return get(Number(lastInsertRowid));
    },

    update(id, fields) {
      const { sql, values } = setClause(fields, EDITABLE);
      if (sql) {
        db.prepare(`UPDATE outreach SET ${sql}, updated_at = ? WHERE id = ? AND user_id = ?`).run(...values, nowIso(), id, userId);
      }
      return get(id);
    },

    listByApplication(applicationId) {
      return all(byApplication, applicationId, userId);
    },

    delete(id) {
      remove.run(id, userId);
    },
  };
}

module.exports = { createOutreachRepo };
