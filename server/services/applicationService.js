/**
 * Job applications: logging one (with its follow-up reminder), editing it,
 * changing its status (which records what moved forward), and deleting it.
 *
 * The reminders an application owns follow it: the follow-up moves with the
 * applied date, the interview reminder with the interview date, and both
 * are renamed when the company or role changes.
 */
const { ValidationError, NotFoundError } = require("../utils/errors");
const { addDays, zonedToUtc } = require("../utils/time");
const { createReminder, cancelReminder, editReminder } = require("./reminderService");

const STATUSES = ["applied", "oa", "interview", "offer", "rejected", "ghosted"];
// After these there is nothing left to prepare for.
const CLOSED = new Set(["rejected", "ghosted", "offer"]);

/**
 * Saves an application and schedules a follow-up `followUpDays` after the
 * application date. Logging the same company and role again returns the
 * existing row instead of a duplicate, unless the posting links differ:
 * two postings with the same title are two applications.
 */
async function logApplication(ctx, { company, role = "", url = null, appliedOn, notes = "" }) {
  const existing = ctx.store.applications
    .findByCompanyAndRole(company, role)
    .find((application) => !url || !application.url || sameUrl(url, application.url));
  if (existing) {
    const fill = {};
    if (url && !existing.url) fill.url = url;
    if (notes && !existing.notes) fill.notes = notes;
    return { application: ctx.store.applications.update(existing.id, fill), created: false, followUp: null };
  }

  const application = ctx.store.applications.create({ company, role, url, appliedOn: appliedOn ?? ctx.today(), notes });
  ctx.store.statusEvents.create({ applicationId: application.id, fromStatus: null, toStatus: "applied" });
  return { application, created: true, followUp: await scheduleFollowUp(ctx, application) };
}

/** The follow-up for an application still waiting for news, or null when it is too old to need one. */
async function scheduleFollowUp(ctx, application) {
  const dueAt = followUpTime(ctx, application.applied_on);
  if (!dueAt) return null;
  return createReminder(ctx, {
    kind: "follow_up",
    applicationId: application.id,
    message: followUpMessage(application),
    dueAt: dueAt.toISOString(),
  });
}

/**
 * 9:00 (REMINDER_HOUR) local, `followUpDays` after applying. If that has
 * passed, tomorrow morning; if it passed more than `followUpDays` ago (an
 * old application logged late), none: a pile of follow-ups for old
 * applications all due tomorrow helps nobody.
 */
function followUpTime(ctx, appliedOn) {
  const { followUpDays, reminderHour, timezone } = ctx.config;
  const planned = zonedToUtc(addDays(appliedOn, followUpDays), reminderHour, 0, timezone);
  if (planned > ctx.clock()) return planned;
  if (addDays(appliedOn, 2 * followUpDays) < ctx.today()) return null;
  return zonedToUtc(addDays(ctx.today(), 1), reminderHour, 0, timezone);
}

/**
 * Edits an application (any EDITABLE fields of the repo) and brings its
 * follow-up and interview reminders in line with the change.
 */
async function updateApplication(ctx, applicationId, fields) {
  const before = requireApplication(ctx, applicationId);
  const after = ctx.store.applications.update(applicationId, fields);
  const renamed = describe(before) !== describe(after);

  if (after.applied_on !== before.applied_on || renamed) {
    for (const reminder of ctx.store.reminders.pendingForApplication(applicationId, "follow_up")) {
      if (after.applied_on === before.applied_on) {
        await editReminder(ctx, reminder.id, { message: followUpMessage(after) });
        continue;
      }
      const dueAt = followUpTime(ctx, after.applied_on);
      if (dueAt) await editReminder(ctx, reminder.id, { message: followUpMessage(after), dueAt });
      else await cancelReminder(ctx, reminder.id);
    }
  }
  if (after.interview_on !== before.interview_on || renamed) await syncInterviewReminder(ctx, after);
  return after;
}

/**
 * One "Interview: …" reminder at REMINDER_HOUR on the interview day while
 * the date is set, in the future, and the application still open.
 */
async function syncInterviewReminder(ctx, application) {
  const [current, ...extra] = ctx.store.reminders.pendingTagged(application.id, "interview");
  for (const reminder of extra) await cancelReminder(ctx, reminder.id);

  const wanted = application.interview_on && application.interview_on >= ctx.today() && !CLOSED.has(application.status);
  if (!wanted) {
    if (current) await cancelReminder(ctx, current.id);
    return null;
  }
  const message = `Interview: ${describe(application)}`;
  const dueAt = zonedToUtc(application.interview_on, ctx.config.reminderHour, 0, ctx.config.timezone);
  if (current) return editReminder(ctx, current.id, { message, dueAt: current.due_at === dueAt.toISOString() ? undefined : dueAt });
  return createReminder(ctx, { kind: "custom", tag: "interview", applicationId: application.id, message, dueAt: dueAt.toISOString() });
}

/**
 * Moves an application to a new status and records the change. Any status
 * other than "applied" means there is news, so pending follow-ups are
 * cancelled; going back to "applied" (a mistake corrected) brings one back.
 */
async function changeStatus(ctx, applicationId, status, note = "") {
  if (!STATUSES.includes(status)) {
    throw new ValidationError(`status must be one of: ${STATUSES.join(", ")}.`);
  }
  const application = requireApplication(ctx, applicationId);
  if (application.status === status) return { application, event: null, cancelledFollowUps: 0 };

  const event = ctx.store.statusEvents.create({
    applicationId,
    fromStatus: application.status,
    toStatus: status,
    note,
  });
  const updated = ctx.store.applications.update(applicationId, { status });

  let cancelledFollowUps = 0;
  if (status !== "applied") {
    for (const reminder of ctx.store.reminders.pendingForApplication(applicationId, "follow_up")) {
      await cancelReminder(ctx, reminder.id);
      cancelledFollowUps += 1;
    }
  } else if (ctx.store.reminders.pendingForApplication(applicationId, "follow_up").length === 0) {
    await scheduleFollowUp(ctx, updated);
  }
  await syncInterviewReminder(ctx, updated);
  return { application: updated, event, cancelledFollowUps };
}

/** Deletes an application, first removing its pending reminders from the calendar. */
async function deleteApplication(ctx, applicationId) {
  requireApplication(ctx, applicationId);
  for (const reminder of ctx.store.reminders.listByApplication(applicationId)) {
    if (reminder.status === "pending") await cancelReminder(ctx, reminder.id);
  }
  ctx.store.applications.delete(applicationId);
}

function requireApplication(ctx, applicationId) {
  const application = ctx.store.applications.get(applicationId);
  if (!application) throw new NotFoundError(`Application #${applicationId} does not exist.`);
  return application;
}

function describe(application) {
  return [application.company, application.role].filter(Boolean).join(" – ");
}

function followUpMessage(application) {
  return `Follow up on ${describe(application)}`;
}

/** Same posting, ignoring http/https, "www.", a trailing slash and tracking parameters. */
function sameUrl(a, b) {
  const clean = (value) => {
    try {
      const url = new URL(value);
      for (const key of [...url.searchParams.keys()]) if (/^utm_|^ref$|^source$/i.test(key)) url.searchParams.delete(key);
      return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}`.toLowerCase();
    } catch {
      return String(value).toLowerCase();
    }
  };
  return clean(a) === clean(b);
}

module.exports = {
  STATUSES,
  logApplication,
  updateApplication,
  changeStatus,
  deleteApplication,
  requireApplication,
  describe,
  followUpTime,
};
