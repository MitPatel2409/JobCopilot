const { one, all, setClause, nowIso } = require("../database");

const EDITABLE = ["message", "due_at", "status", "notified_at", "completed_at", "calendar_event_id"];

// Reminders carry what they point at, so lists and notifications can show it.
const SELECT = `
  SELECT r.*, a.company, a.role, a.url, t.name AS topic
  FROM reminders r
  LEFT JOIN applications a ON a.id = r.application_id
  LEFT JOIN study_topics t ON t.id = r.topic_id`;

function createRemindersRepo(db, userId) {
  const insert = db.prepare(`
    INSERT INTO reminders (user_id, kind, application_id, topic_id, revision_stage, tag, message, due_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const mine = (where) => db.prepare(`${SELECT} WHERE r.user_id = ? AND ${where}`);

  const byId = mine("r.id = ?");
  const pendingBefore = mine("r.status = 'pending' AND r.due_at < ? ORDER BY r.due_at, r.id");
  const pendingAll = mine("r.status = 'pending' ORDER BY r.due_at, r.id");
  const dueUnnotified = mine("r.status = 'pending' AND r.due_at <= ? AND r.notified_at IS NULL ORDER BY r.due_at, r.id");
  const pendingForApplication = mine("r.status = 'pending' AND r.application_id = ? AND r.kind = ? ORDER BY r.due_at");
  const pendingTagged = mine("r.status = 'pending' AND r.application_id = ? AND r.tag = ? ORDER BY r.due_at, r.id");
  const pendingForTopic = mine("r.status = 'pending' AND r.topic_id = ? ORDER BY r.due_at");
  const byApplication = mine("r.application_id = ? ORDER BY r.due_at");
  const byTopic = mine("r.topic_id = ? ORDER BY r.due_at");
  const remove = db.prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?");

  function get(id) {
    return one(byId, userId, id);
  }

  return {
    get,

    create({ kind, applicationId = null, topicId = null, revisionStage = null, tag = null, message, dueAt }) {
      const { lastInsertRowid } = insert.run(userId, kind, applicationId, topicId, revisionStage, tag, message, dueAt, nowIso());
      return get(Number(lastInsertRowid));
    },

    update(id, fields) {
      const { sql, values } = setClause(fields, EDITABLE);
      if (sql) db.prepare(`UPDATE reminders SET ${sql} WHERE id = ? AND user_id = ?`).run(...values, id, userId);
      return get(id);
    },

    /** Pending reminders due before `before` (an ISO instant), or all of them. */
    listPending({ before } = {}) {
      return before ? all(pendingBefore, userId, before) : all(pendingAll, userId);
    },

    /** Pending reminders that are due and have not been pushed to the browser yet. */
    dueUnnotified(now) {
      return all(dueUnnotified, userId, now);
    },

    pendingForApplication(applicationId, kind) {
      return all(pendingForApplication, userId, applicationId, kind);
    },

    /** Pending reminders the app manages for an application, e.g. tag "interview". */
    pendingTagged(applicationId, tag) {
      return all(pendingTagged, userId, applicationId, tag);
    },

    pendingForTopic(topicId) {
      return all(pendingForTopic, userId, topicId);
    },

    listByApplication(applicationId) {
      return all(byApplication, userId, applicationId);
    },

    listByTopic(topicId) {
      return all(byTopic, userId, topicId);
    },

    delete(id) {
      remove.run(id, userId);
    },
  };
}

module.exports = { createRemindersRepo };
