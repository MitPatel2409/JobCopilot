const { one, nowIso } = require("../database");

const INFO = "id, application_id, filename, mime, size, created_at, length(text) AS text_length";

/**
 * Résumé files: one per application (the tailored version) and one with no
 * application (the base résumé). `applicationId` null means the base one.
 * SQLite's `IS` compares NULL to NULL as equal, so one statement serves both.
 */
function createDocumentsRepo(db, userId) {
  const insert = db.prepare(`
    INSERT INTO documents (user_id, application_id, filename, mime, size, content, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const info = db.prepare(`SELECT ${INFO} FROM documents WHERE user_id = ? AND application_id IS ?`);
  const file = db.prepare("SELECT * FROM documents WHERE user_id = ? AND application_id IS ?");
  const text = db.prepare("SELECT text FROM documents WHERE user_id = ? AND application_id IS ?");
  const remove = db.prepare("DELETE FROM documents WHERE user_id = ? AND application_id IS ?");
  const copy = db.prepare(`
    INSERT INTO documents (user_id, application_id, filename, mime, size, content, text, created_at)
    SELECT user_id, ?, filename, mime, size, content, text, ? FROM documents WHERE user_id = ? AND application_id IS ?`);

  return {
    /** Saves a résumé, replacing the one already there. */
    save(applicationId, { filename, mime, content, text: extracted }) {
      remove.run(userId, applicationId);
      insert.run(userId, applicationId, filename, mime, content.length, content, extracted, nowIso());
      return this.info(applicationId);
    },

    /** Puts a copy of the résumé saved for `fromApplicationId` (null: the base one) on `toApplicationId`. */
    copy(fromApplicationId, toApplicationId) {
      remove.run(userId, toApplicationId);
      copy.run(toApplicationId, nowIso(), userId, fromApplicationId);
      return this.info(toApplicationId);
    },

    /** Name, size and date, without the file. */
    info(applicationId) {
      return one(info, userId, applicationId);
    },

    /** The whole row, file bytes included, for a download. */
    file(applicationId) {
      return one(file, userId, applicationId);
    },

    text(applicationId) {
      return one(text, userId, applicationId)?.text ?? null;
    },

    delete(applicationId) {
      remove.run(userId, applicationId);
    },
  };
}

module.exports = { createDocumentsRepo };
