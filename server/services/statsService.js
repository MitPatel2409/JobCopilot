/**
 * The numbers behind the Insights view: how many applications went out each
 * week, how far they got, how fast replies came, and the study totals.
 */
const { addDays, daysBetween, localDate, startOfWeek } = require("../utils/time");

const WEEKS = 8;

// Each funnel stage counts applications that got at least that far.
const FUNNEL = [
  { stage: "oa", statuses: ["oa", "interview", "offer"] },
  { stage: "interview", statuses: ["interview", "offer"] },
  { stage: "offer", statuses: ["offer"] },
];

function buildStats(ctx) {
  const { stats, journal } = ctx.store;
  const today = ctx.today();
  const total = stats.total();

  const replyDays = stats
    .firstReplies()
    .map((row) => daysBetween(row.applied_on, localDate(new Date(row.replied_at), ctx.config.timezone)))
    .map((days) => Math.max(days, 0));

  return {
    date: today,
    total,
    byStatus: stats.byStatus(),
    weekly: weeklyCounts(stats, today),
    funnel: [
      { stage: "applied", count: total },
      ...FUNNEL.map(({ stage, statuses }) => ({ stage, count: stats.reachedAny(statuses) })),
    ],
    replied: replyDays.length,
    responseRate: total ? replyDays.length / total : null,
    medianDaysToReply: median(replyDays),
    streak: streak(journal.list({ to: today }).map((entry) => entry.date), today),
    study: stats.study(),
  };
}

/** Applications per week (Monday to Sunday) for the last WEEKS weeks, oldest first. */
function weeklyCounts(stats, today) {
  const first = addDays(startOfWeek(today), -7 * (WEEKS - 1));
  const weeks = Array.from({ length: WEEKS }, (_, index) => ({ start: addDays(first, 7 * index), count: 0 }));

  for (const date of stats.appliedSince(first)) {
    const week = weeks[Math.floor(daysBetween(first, date) / 7)];
    if (week) week.count += 1;
  }
  return weeks;
}

/** Days in a row with a journal entry, ending today (or yesterday, if today is still empty). */
function streak(dates, today) {
  const logged = new Set(dates);
  let day = logged.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (logged.has(day)) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

module.exports = { buildStats, streak, median };
