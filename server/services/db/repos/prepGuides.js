const { one, nowIso } = require("../database");

function parse(row) {
  return row && { ...JSON.parse(row.guide), application_id: row.application_id, created_at: row.created_at };
}

// A guide belongs to an application; every statement checks that it is the user's.
function createPrepGuidesRepo(db, userId) {
  const owns = "EXISTS (SELECT 1 FROM applications a WHERE a.id = ? AND a.user_id = ?)";
  const byApplication = db.prepare(`SELECT * FROM prep_guides WHERE application_id = ? AND ${owns}`);
  const upsert = db.prepare(`
    INSERT INTO prep_guides (application_id, guide, created_at) VALUES (?, ?, ?)
    ON CONFLICT (application_id) DO UPDATE SET guide = excluded.guide, created_at = excluded.created_at`);

  return {
    get(applicationId) {
      return parse(one(byApplication, applicationId, applicationId, userId));
    },

    /** Callers check the application is the user's first. */
    save(applicationId, guide) {
      upsert.run(applicationId, JSON.stringify(guide), nowIso());
      return this.get(applicationId);
    },
  };
}

module.exports = { createPrepGuidesRepo };
