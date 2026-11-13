const { one, all, nowIso } = require("../database");

// Each topic with its note count, last study date and next pending revision.
const SELECT = `
  SELECT t.*,
    (SELECT COUNT(*) FROM study_notes n WHERE n.topic_id = t.id) AS note_count,
    (SELECT MAX(n.studied_on) FROM study_notes n WHERE n.topic_id = t.id) AS last_studied,
    (SELECT MIN(r.due_at) FROM reminders r WHERE r.topic_id = t.id AND r.status = 'pending') AS next_revision
  FROM study_topics t`;

function createTopicsRepo(db, userId) {
  const insert = db.prepare("INSERT INTO study_topics (user_id, name, created_at) VALUES (?, ?, ?)");
  const byId = db.prepare(`${SELECT} WHERE t.id = ? AND t.user_id = ?`);
  const byName = db.prepare(`${SELECT} WHERE t.name = ? AND t.user_id = ?`);
  const list = db.prepare(`${SELECT} WHERE t.user_id = ? ORDER BY last_studied DESC, t.name`);
  const rename = db.prepare("UPDATE study_topics SET name = ? WHERE id = ? AND user_id = ?");
  const setPlan = db.prepare("UPDATE study_topics SET plan = ? WHERE id = ? AND user_id = ?");
  const remove = db.prepare("DELETE FROM study_topics WHERE id = ? AND user_id = ?");

  // Notes belong to a topic; every statement checks that it is the user's.
  const ownsTopic = "EXISTS (SELECT 1 FROM study_topics t WHERE t.id = study_notes.topic_id AND t.user_id = ?)";
  const insertNote = db.prepare("INSERT INTO study_notes (topic_id, body, studied_on, created_at) VALUES (?, ?, ?, ?)");
  const noteById = db.prepare(`SELECT * FROM study_notes WHERE id = ? AND ${ownsTopic}`);
  const notesByTopic = db.prepare(`SELECT * FROM study_notes WHERE topic_id = ? AND ${ownsTopic} ORDER BY studied_on DESC, id DESC`);
  const updateNote = db.prepare(`UPDATE study_notes SET body = ?, studied_on = ? WHERE id = ? AND ${ownsTopic}`);
  const removeNote = db.prepare(`DELETE FROM study_notes WHERE id = ? AND ${ownsTopic}`);

  function get(id) {
    return one(byId, id, userId);
  }

  return {
    get,

    /** Name lookup ignores case, so "docker" and "Docker" are one topic. */
    findByName(name) {
      return one(byName, name, userId);
    },

    create(name) {
      const { lastInsertRowid } = insert.run(userId, name, nowIso());
      return get(Number(lastInsertRowid));
    },

    rename(id, name) {
      rename.run(name, id, userId);
      return get(id);
    },

    setPlan(id, plan) {
      setPlan.run(plan, id, userId);
      return get(id);
    },

    list() {
      return all(list, userId);
    },

    delete(id) {
      remove.run(id, userId);
    },

    /** Callers check the topic is the user's first. */
    addNote({ topicId, body, studiedOn }) {
      const { lastInsertRowid } = insertNote.run(topicId, body, studiedOn, nowIso());
      return this.getNote(Number(lastInsertRowid));
    },

    getNote(id) {
      return one(noteById, id, userId);
    },

    updateNote(id, { body, studiedOn }) {
      const note = this.getNote(id);
      if (!note) return null;
      updateNote.run(body ?? note.body, studiedOn ?? note.studied_on, id, userId);
      return this.getNote(id);
    },

    deleteNote(id) {
      removeNote.run(id, userId);
    },

    notes(topicId) {
      return all(notesByTopic, topicId, userId);
    },
  };
}

module.exports = { createTopicsRepo };
