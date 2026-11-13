const { one, all, nowIso } = require("../database");

function createJournalRepo(db, userId) {
  const byDate = db.prepare("SELECT * FROM journal_entries WHERE user_id = ? AND date = ?");
  // A day's summary grows one line per log_journal call.
  const append = db.prepare(`
    INSERT INTO journal_entries (user_id, date, summary, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, date) DO UPDATE SET summary = summary || char(10) || excluded.summary, updated_at = excluded.updated_at`);
  const replace = db.prepare(`
    INSERT INTO journal_entries (user_id, date, summary, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, date) DO UPDATE SET summary = excluded.summary, updated_at = excluded.updated_at`);
  const remove = db.prepare("DELETE FROM journal_entries WHERE user_id = ? AND date = ?");
  const between = db.prepare("SELECT * FROM journal_entries WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date DESC");

  return {
    get(date) {
      return one(byDate, userId, date);
    },

    append(date, line) {
      append.run(userId, date, line, nowIso());
      return one(byDate, userId, date);
    },

    /** Replaces a day's whole summary; an empty one deletes the day. */
    replace(date, summary) {
      if (!summary) {
        remove.run(userId, date);
        return null;
      }
      replace.run(userId, date, summary, nowIso());
      return one(byDate, userId, date);
    },

    list({ from = "0000-01-01", to = "9999-12-31" } = {}) {
      return all(between, userId, from, to);
    },
  };
}

module.exports = { createJournalRepo };
