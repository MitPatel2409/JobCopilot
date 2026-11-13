const args = require("../utils/args");
const { addDays } = require("../utils/time");
const { ValidationError } = require("../utils/errors");
const { dueBefore } = require("../services/dueRange");
const { requireApplication } = require("../services/applicationService");
const { createReminder, completeReminder, snoozeReminder, editReminder, deleteReminder } = require("../services/reminderService");

exports.list = (req, res) => {
  const ctx = req.ctx;
  const range = args.oneOf(req.query, "range", ["overdue", "today", "week", "all"]) ?? "all";
  res.json({ reminders: ctx.store.reminders.listPending({ before: dueBefore(ctx, range) }) });
};

/** Adds a reminder from the form, optionally linked to an application. */
exports.create = async (req, res) => {
  const ctx = req.ctx;
  const body = req.body ?? {};

  const due = args.dateTime(ctx, body, "due", { required: true });
  if (due < ctx.clock()) throw new ValidationError("due is in the past.");
  const applicationId = args.id(body, "application_id");
  if (applicationId) requireApplication(ctx, applicationId);

  const reminder = await createReminder(ctx, {
    kind: "custom",
    applicationId: applicationId ?? null,
    message: args.text(body, "message", { required: true, max: 300 }),
    dueAt: due.toISOString(),
  });
  res.status(201).json({ reminder });
};

/** Changes the text and/or the time; a new time must not be in the past. */
exports.update = async (req, res) => {
  const ctx = req.ctx;
  const body = req.body ?? {};
  const due = args.dateTime(ctx, body, "due");
  if (due && due < ctx.clock()) throw new ValidationError("due is in the past.");

  const reminder = await editReminder(ctx, args.id(req.params, "id", { required: true }), {
    message: args.text(body, "message", { max: 300 }),
    dueAt: due,
  });
  res.json({ reminder });
};

exports.remove = async (req, res) => {
  await deleteReminder(req.ctx, args.id(req.params, "id", { required: true }));
  res.status(204).end();
};

exports.done = async (req, res) => {
  const reminder = await completeReminder(req.ctx, args.id(req.params, "id", { required: true }));
  res.json({ reminder });
};

/** Moves a reminder to `until` (local date or date-time); defaults to tomorrow morning. */
exports.snooze = async (req, res) => {
  const ctx = req.ctx;
  const body = { until: addDays(ctx.today(), 1), ...req.body };
  const until = args.dateTime(ctx, body, "until", { required: true });
  if (until < ctx.clock()) throw new ValidationError("until is in the past.");

  const reminder = await snoozeReminder(ctx, args.id(req.params, "id", { required: true }), until);
  res.json({ reminder });
};
