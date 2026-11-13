const { one, all, nowIso } = require("../database");

// Status events belong to an application; reads check that it is the user's.
function createStatusEventsRepo(db, userId) {
  const insert = db.prepare(
    "INSERT INTO status_events (application_id, from_status, to_status, note, at) VALUES (?, ?, ?, ?, ?)",
  );
  const byId = db.prepare("SELECT * FROM status_events WHERE id = ?");
  const byApplication = db.prepare(`
    SELECT e.* FROM status_events e JOIN applications a ON a.id = e.application_id
    WHERE e.application_id = ? AND a.user_id = ? ORDER BY e.at, e.id`);

  return {
    /** Callers check the application is the user's first (applicationService.requireApplication). */
    create({ applicationId, fromStatus, toStatus, note = "" }) {
      const { lastInsertRowid } = insert.run(applicationId, fromStatus, toStatus, note, nowIso());
      return one(byId, Number(lastInsertRowid));
    },

    listByApplication(applicationId) {
      return all(byApplication, applicationId, userId);
    },
  };
}

module.exports = { createStatusEventsRepo };
