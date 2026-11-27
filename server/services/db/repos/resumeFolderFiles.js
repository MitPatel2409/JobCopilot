const { one, all, nowIso } = require("../database");

/** Résumé files seen in the watched folder (services/resumeFolderService.js). */
function createResumeFolderFilesRepo(db, userId) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO resume_folder_files (user_id, path, filename, size, mtime_ms, sha256, text, status, seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const byId = db.prepare("SELECT * FROM resume_folder_files WHERE id = ? AND user_id = ?");
  const byPath = db.prepare("SELECT * FROM resume_folder_files WHERE user_id = ? AND path = ?");
  const byHash = db.prepare("SELECT * FROM resume_folder_files WHERE user_id = ? AND sha256 = ?");
  const pending = db.prepare("SELECT * FROM resume_folder_files WHERE user_id = ? AND status = 'pending' ORDER BY mtime_ms DESC, id DESC");
  const touch = db.prepare("UPDATE resume_folder_files SET size = ?, mtime_ms = ? WHERE id = ? AND user_id = ?");
  const move = db.prepare("UPDATE resume_folder_files SET path = ?, filename = ?, size = ?, mtime_ms = ? WHERE id = ? AND user_id = ?");
  const setState = db.prepare(
    "UPDATE resume_folder_files SET status = ?, application_id = ?, auto_attached = ?, no_auto = ? WHERE id = ? AND user_id = ?",
  );
  const remove = db.prepare("DELETE FROM resume_folder_files WHERE id = ? AND user_id = ?");

  return {
    get(id) {
      return one(byId, id, userId);
    },

    /** Every row for a path: the file as it was at each hash it has had. */
    forPath(path) {
      return all(byPath, userId, path);
    },

    forHash(sha256) {
      return all(byHash, userId, sha256);
    },

    listPending() {
      return all(pending, userId);
    },

    create({ path, filename, size, mtimeMs, sha256, text, status = "pending" }) {
      const { changes, lastInsertRowid } = insert.run(userId, path, filename, size, mtimeMs, sha256, text, status, nowIso());
      return changes ? this.get(Number(lastInsertRowid)) : null;
    },

    /** The file was saved again with the same content: remember its new size and time. */
    touch(id, { size, mtimeMs }) {
      touch.run(size, mtimeMs, id, userId);
    },

    /** The same content under a new name. */
    move(id, { path, filename, size, mtimeMs }) {
      move.run(path, filename, size, mtimeMs, id, userId);
    },

    /** `noAuto` left out keeps what the row has. */
    setState(id, { status, applicationId = null, autoAttached = false, noAuto }) {
      const current = this.get(id);
      setState.run(status, applicationId, autoAttached ? 1 : 0, noAuto === undefined ? current.no_auto : noAuto ? 1 : 0, id, userId);
      return this.get(id);
    },

    delete(id) {
      remove.run(id, userId);
    },
  };
}

module.exports = { createResumeFolderFilesRepo };
