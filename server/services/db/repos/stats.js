const { one, all } = require("../database");

/** Read-only counts for the Insights view. */
function createStatsRepo(db, userId) {
  const total = db.prepare("SELECT COUNT(*) AS count FROM applications WHERE user_id = ?");
  const byStatus = db.prepare("SELECT status, COUNT(*) AS count FROM applications WHERE user_id = ? GROUP BY status");
  const appliedSince = db.prepare("SELECT applied_on FROM applications WHERE user_id = ? AND applied_on >= ? ORDER BY applied_on");
  // The first time each application heard back. One that is back on "applied"
  // was moved by mistake and then corrected, so it does not count.
  const firstReplies = db.prepare(`
    SELECT a.applied_on, MIN(e.at) AS replied_at
    FROM applications a
    JOIN status_events e ON e.application_id = a.id
    WHERE a.user_id = ? AND e.to_status IN ('oa', 'interview', 'offer', 'rejected') AND a.status != 'applied'
    GROUP BY a.id`);
  const study = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM study_topics WHERE user_id = ?1) AS topics,
      (SELECT COUNT(*) FROM study_notes n JOIN study_topics t ON t.id = n.topic_id WHERE t.user_id = ?1) AS notes,
      (SELECT COUNT(*) FROM reminders WHERE user_id = ?1 AND kind = 'revision' AND status = 'done') AS revisions_done,
      (SELECT COUNT(*) FROM reminders WHERE user_id = ?1 AND kind = 'revision' AND status = 'pending') AS revisions_pending`);

  return {
    total() {
      return one(total, userId).count;
    },

    /** { applied: 3, interview: 1, ... } for the statuses in use. */
    byStatus() {
      return Object.fromEntries(all(byStatus, userId).map((row) => [row.status, row.count]));
    },

    /** The applied_on date of every application sent on or after `date`. */
    appliedSince(date) {
      return all(appliedSince, userId, date).map((row) => row.applied_on);
    },

    /**
     * How many applications ever moved to one of `statuses`, even if they moved
     * on since (a rejection after an interview still reached the interview).
     */
    reachedAny(statuses) {
      const marks = statuses.map(() => "?").join(", ");
      return one(
        db.prepare(`
          SELECT COUNT(DISTINCT e.application_id) AS count
          FROM status_events e
          JOIN applications a ON a.id = e.application_id
          WHERE a.user_id = ? AND e.to_status IN (${marks}) AND a.status != 'applied'`),
        userId,
        ...statuses,
      ).count;
    },

    firstReplies() {
      return all(firstReplies, userId);
    },

    study() {
      return one(study, userId);
    },
  };
}

module.exports = { createStatsRepo };
