const { one, all, setClause, nowIso } = require("../database");

const EDITABLE = [
  "company",
  "role",
  "url",
  "status",
  "applied_on",
  "notes",
  "no_url",
  "no_contact",
  "jd_text",
  "jd_saved_at",
  "interview_on",
];

// Every read adds how many contacts the application has, for the "missing" check.
const SELECT = `
  SELECT a.*, (SELECT COUNT(*) FROM contacts c WHERE c.application_id = a.id) AS contact_count,
    (SELECT d.filename FROM documents d WHERE d.application_id = a.id) AS resume_filename
  FROM applications a`;

/** What the agent should still ask about: the job link, a recruiter and the job description. */
function withMissing(application) {
  if (!application) return null;
  const missing = [];
  if (!application.url && !application.no_url) missing.push("url");
  if (application.contact_count === 0 && !application.no_contact) missing.push("contact");
  if (!application.jd_text) missing.push("jd");
  return { ...application, has_jd: Boolean(application.jd_text), missing };
}

/** List rows leave the job description itself out; `has_jd` says whether there is one. */
function brief(application) {
  const { jd_text: _jd, ...rest } = withMissing(application);
  return rest;
}

function createApplicationsRepo(db, userId) {
  const insert = db.prepare(`
    INSERT INTO applications (user_id, company, role, url, status, applied_on, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const byId = db.prepare(`${SELECT} WHERE a.id = ? AND a.user_id = ?`);
  const byCompanyAndRole = db.prepare(
    `${SELECT} WHERE a.user_id = ? AND lower(a.company) = lower(?) AND lower(a.role) = lower(?) ORDER BY a.id`,
  );
  const recent = db.prepare(`${SELECT} WHERE a.user_id = ? ORDER BY a.updated_at DESC, a.id DESC LIMIT ?`);
  const listAll = db.prepare(`${SELECT} WHERE a.user_id = ? ORDER BY a.applied_on DESC, a.id DESC`);
  const listByStatus = db.prepare(`${SELECT} WHERE a.user_id = ? AND a.status = ? ORDER BY a.applied_on DESC, a.id DESC`);
  const stale = db.prepare(`${SELECT} WHERE a.user_id = ? AND a.status = 'applied' AND a.applied_on <= ? ORDER BY a.applied_on`);
  const remove = db.prepare("DELETE FROM applications WHERE id = ? AND user_id = ?");

  function get(id) {
    return withMissing(one(byId, id, userId));
  }

  return {
    /** The full row, job description included. */
    get,

    create({ company, role = "", url = null, status = "applied", appliedOn, notes = "" }) {
      const now = nowIso();
      const { lastInsertRowid } = insert.run(userId, company, role, url, status, appliedOn, notes, now, now);
      return get(Number(lastInsertRowid));
    },

    /** Every application with this company and role (ignoring case), oldest first. */
    findByCompanyAndRole(company, role = "") {
      return all(byCompanyAndRole, userId, company, role).map(withMissing);
    },

    update(id, fields) {
      const { sql, values } = setClause(fields, EDITABLE);
      if (sql) {
        db.prepare(`UPDATE applications SET ${sql}, updated_at = ? WHERE id = ? AND user_id = ?`).run(...values, nowIso(), id, userId);
      }
      return get(id);
    },

    list({ status } = {}) {
      return (status ? all(listByStatus, userId, status) : all(listAll, userId)).map(brief);
    },

    recent(limit) {
      return all(recent, userId, limit).map(brief);
    },

    /**
     * Case-insensitive search on company and role. Every word must match one
     * of them ("rbc amplify" finds company "RBC", role "Amplify Intern"); if
     * nothing matches all words, any word will do.
     */
    search(query) {
      const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length === 0) return this.list();

      const condition = "(lower(a.company) LIKE ? OR lower(a.role) LIKE ?)";
      const params = words.flatMap((word) => [`%${word}%`, `%${word}%`]);
      const run = (joiner) =>
        all(
          db.prepare(`${SELECT} WHERE a.user_id = ? AND (${words.map(() => condition).join(joiner)}) ORDER BY a.applied_on DESC`),
          userId,
          ...params,
        );

      const strict = run(" AND ");
      return (strict.length > 0 ? strict : run(" OR ")).map(brief);
    },

    /** Applications still marked "applied" that were sent on or before `date`. */
    staleSince(date) {
      return all(stale, userId, date).map(brief);
    },

    delete(id) {
      remove.run(id, userId);
    },
  };
}

module.exports = { createApplicationsRepo };
