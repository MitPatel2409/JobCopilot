const { dueBefore } = require("../services/dueRange");
const { addDays, localHour, startOfWeek } = require("../utils/time");
const { STALE_DAYS } = require("../services/scheduler/digest");
const { inbox } = require("../services/resumeFolderService");

/** Everything the "Today" tab shows, in one request. */
exports.today = (req, res) => {
  const ctx = req.ctx;
  const today = ctx.today();
  const now = ctx.clock();

  const due = ctx.store.reminders.listPending({ before: dueBefore(ctx, "today") });
  const dueIds = new Set(due.map((reminder) => reminder.id));
  const upcoming = ctx.store.reminders
    .listPending({ before: dueBefore(ctx, "week") })
    .filter((reminder) => !dueIds.has(reminder.id));
  const journal = ctx.store.journal.get(today);

  res.json({
    date: today,
    now: now.toISOString(),
    due,
    upcoming,
    journal,
    appliedThisWeek: ctx.store.stats.appliedSince(startOfWeek(today)).length,
    replies: ctx.store.mailMatches.listNew(),
    resumeFiles: inbox(ctx),
    // Still "applied" after three weeks, with no reminder waiting: worth a follow-up or "no reply".
    quiet: ctx.store.applications
      .staleSince(addDays(today, -STALE_DAYS))
      .filter((application) => !ctx.store.reminders.listByApplication(application.id).some((r) => r.status === "pending")),
    nudge: !journal && localHour(now, ctx.config.timezone) >= ctx.config.nudgeHour,
  });
};
