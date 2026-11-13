const { one, all, nowIso } = require("../database");

const SELECT = `
  SELECT m.*, a.company, a.role, a.status AS application_status, c.name AS contact_name
  FROM mail_matches m
  LEFT JOIN applications a ON a.id = m.application_id
  LEFT JOIN contacts c ON c.id = m.contact_id`;

/** Recruiter mail the reply watcher found. */
function createMailMatchesRepo(db, userId) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO mail_matches
      (user_id, message_id, application_id, contact_id, sender, subject, snippet, received_at, suggested_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const byId = db.prepare(`${SELECT} WHERE m.id = ? AND m.user_id = ?`);
  const byMessage = db.prepare("SELECT id FROM mail_matches WHERE user_id = ? AND message_id = ?");
  const fresh = db.prepare(`${SELECT} WHERE m.user_id = ? AND m.state = 'new' ORDER BY m.received_at DESC`);
  const setState = db.prepare("UPDATE mail_matches SET state = ? WHERE id = ? AND user_id = ?");

  return {
    get(id) {
      return one(byId, id, userId);
    },

    has(messageId) {
      return Boolean(one(byMessage, userId, messageId));
    },

    /** Saves a match; one already saved for the same message is left as it is. Returns the new row or null. */
    create({ messageId, applicationId, contactId, sender, subject, snippet, receivedAt, suggestedStatus }) {
      const { changes, lastInsertRowid } = insert.run(
        userId,
        messageId,
        applicationId,
        contactId,
        sender,
        subject,
        snippet,
        receivedAt,
        suggestedStatus,
        nowIso(),
      );
      return changes ? this.get(Number(lastInsertRowid)) : null;
    },

    listNew() {
      return all(fresh, userId);
    },

    setState(id, state) {
      setState.run(state, id, userId);
      return this.get(id);
    },
  };
}

module.exports = { createMailMatchesRepo };
