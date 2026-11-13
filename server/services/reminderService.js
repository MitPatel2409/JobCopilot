/**
 * Creating, finishing, moving, editing and deleting reminders, keeping Google
 * Calendar in step.
 *
 * The database is the source of truth: a calendar call that fails is logged
 * and skipped, never allowed to lose the reminder itself.
 */
const { NotFoundError } = require("../utils/errors");

const EVENT_MINUTES = 30;

async function createReminder(ctx, fields) {
  const reminder = ctx.store.reminders.create(fields);
  if (!ctx.calendar) return reminder;

  const eventId = await safeCalendarCall("create", () => ctx.calendar.createEvent(buildCalendarEvent(ctx, reminder)));
  return eventId ? ctx.store.reminders.update(reminder.id, { calendar_event_id: eventId }) : reminder;
}

async function completeReminder(ctx, id) {
  const reminder = requireReminder(ctx, id);
  await removeCalendarEvent(ctx, reminder);
  return ctx.store.reminders.update(id, { status: "done", completed_at: ctx.clock().toISOString() });
}

async function cancelReminder(ctx, id) {
  const reminder = requireReminder(ctx, id);
  await removeCalendarEvent(ctx, reminder);
  return ctx.store.reminders.update(id, { status: "cancelled" });
}

/** Moves a reminder to `dueAt` (a Date); it will notify again then. */
async function snoozeReminder(ctx, id, dueAt) {
  requireReminder(ctx, id);
  const reminder = ctx.store.reminders.update(id, { due_at: dueAt.toISOString(), notified_at: null, status: "pending" });

  if (ctx.calendar && reminder.calendar_event_id) {
    await safeCalendarCall("update", () =>
      ctx.calendar.updateEvent(reminder.calendar_event_id, buildCalendarEvent(ctx, reminder)),
    );
  }
  return reminder;
}

/** Changes a reminder's text and/or time from the UI. A new time makes it notify again. */
async function editReminder(ctx, id, { message, dueAt }) {
  requireReminder(ctx, id);
  const fields = { message };
  if (dueAt) Object.assign(fields, { due_at: dueAt.toISOString(), notified_at: null });
  const reminder = ctx.store.reminders.update(id, fields);

  if (ctx.calendar && reminder.calendar_event_id && reminder.status === "pending") {
    await safeCalendarCall("update", () =>
      ctx.calendar.updateEvent(reminder.calendar_event_id, buildCalendarEvent(ctx, reminder)),
    );
  }
  return reminder;
}

/** Removes a reminder and its calendar event for good. */
async function deleteReminder(ctx, id) {
  const reminder = requireReminder(ctx, id);
  await removeCalendarEvent(ctx, reminder);
  ctx.store.reminders.delete(id);
}

function requireReminder(ctx, id) {
  const reminder = ctx.store.reminders.get(id);
  if (!reminder) throw new NotFoundError(`Reminder #${id} does not exist.`);
  return reminder;
}

async function removeCalendarEvent(ctx, reminder) {
  if (ctx.calendar && reminder.calendar_event_id) {
    await safeCalendarCall("delete", () => ctx.calendar.deleteEvent(reminder.calendar_event_id));
  }
}

async function safeCalendarCall(action, call) {
  try {
    return await call();
  } catch (error) {
    console.warn(`Google Calendar ${action} failed: ${error.message}`);
    return null;
  }
}

/**
 * The calendar event for a reminder. For a follow-up the description holds
 * everything needed to act on it: the job link, recruiters, and a mail link.
 */
function buildCalendarEvent(ctx, reminder) {
  const start = new Date(reminder.due_at);
  const lines = [];

  if (reminder.application_id) {
    if (reminder.url) lines.push(`Job posting: ${reminder.url}`);
    for (const contact of ctx.store.contacts.listByApplication(reminder.application_id)) {
      lines.push(describeContact(contact, reminder));
    }
  }
  if (reminder.topic_id) {
    const [latest] = ctx.store.topics.notes(reminder.topic_id);
    if (latest) lines.push(`Last note (${latest.studied_on}): ${latest.body}`);
  }
  lines.push(`Open Job-Copilot: ${ctx.config.appUrl}`);

  return {
    summary: reminder.message,
    description: lines.join("\n"),
    start,
    end: new Date(start.getTime() + EVENT_MINUTES * 60 * 1000),
  };
}

function describeContact(contact, reminder) {
  const parts = [`Recruiter: ${contact.name}${contact.title ? ` (${contact.title})` : ""}`];
  if (contact.linkedin_url) parts.push(`LinkedIn: ${contact.linkedin_url}`);
  if (contact.email) {
    const subject = encodeURIComponent(`Following up: ${[reminder.company, reminder.role].filter(Boolean).join(" ")}`);
    parts.push(`Email: ${contact.email} (mailto:${contact.email}?subject=${subject})`);
  }
  return parts.join(" | ");
}

module.exports = {
  createReminder,
  completeReminder,
  cancelReminder,
  snoozeReminder,
  editReminder,
  deleteReminder,
  requireReminder,
  buildCalendarEvent,
};
