const args = require("../utils/args");
const { NotFoundError, ValidationError } = require("../utils/errors");
const { saveResume } = require("../services/documentService");
const { sendDocument } = require("../middleware/upload");

const HOURS = ["reminder_hour", "digest_hour", "nudge_hour"];

/** The owner's settings, the server defaults they override, and their base résumé. */
exports.get = (req, res) => {
  res.json(profile(req.ctx, req.ctx.app.users.get(req.user.id)));
};

/**
 * Saves settings. A setting sent as null goes back to the server default.
 * Changing the timezone or hours applies from the next minute's scheduler tick.
 */
exports.update = (req, res) => {
  const ctx = req.ctx;
  const body = req.body ?? {};
  const fields = {};

  if ("name" in body) fields.name = body.name === null || body.name === "" ? null : args.text(body, "name", { max: 100 });
  if ("pitch" in body) fields.pitch = body.pitch === null || body.pitch === "" ? null : args.text(body, "pitch", { max: 600 });
  if ("timezone" in body) {
    fields.timezone = body.timezone === null || body.timezone === "" ? null : checkTimezone(args.text(body, "timezone", { max: 64 }));
  }
  for (const field of HOURS) {
    if (field in body) fields[field] = body[field] === null || body[field] === "" ? null : wholeNumber(body[field], field, 0, 23);
  }
  if ("follow_up_days" in body) {
    fields.follow_up_days = body.follow_up_days === null || body.follow_up_days === "" ? null : wholeNumber(body.follow_up_days, "follow_up_days", 1, 60);
  }
  if ("digest_enabled" in body) fields.digest_enabled = body.digest_enabled ? 1 : 0;

  const user = ctx.app.users.update(req.user.id, fields);
  res.json(profile(ctx.app.forUser(user), user));
};

exports.uploadResume = async (req, res) => {
  res.status(201).json({ resume: await saveResume(req.ctx, null, req.file) });
};

exports.downloadResume = (req, res) => {
  const document = req.ctx.store.documents.file(null);
  if (!document) throw new NotFoundError("No base résumé saved.");
  sendDocument(res, document);
};

exports.deleteResume = (req, res) => {
  req.ctx.store.documents.delete(null);
  res.status(204).end();
};

function profile(ctx, user) {
  const { config } = ctx.app;
  return {
    user: { id: user.id, name: user.name, email: user.email },
    settings: {
      name: user.name,
      pitch: user.pitch,
      timezone: user.timezone,
      reminder_hour: user.reminder_hour,
      digest_hour: user.digest_hour,
      nudge_hour: user.nudge_hour,
      follow_up_days: user.follow_up_days,
      digest_enabled: user.digest_enabled !== 0,
    },
    defaults: {
      name: config.userName,
      pitch: config.userPitch,
      timezone: config.timezone,
      reminder_hour: config.reminderHour,
      digest_hour: config.digestHour,
      nudge_hour: config.nudgeHour,
      follow_up_days: config.followUpDays,
    },
    resume: ctx.store.documents.info(null),
  };
}

function checkTimezone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    throw new ValidationError(`"${value}" is not a timezone (e.g. America/Toronto).`);
  }
}

function wholeNumber(value, field, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new ValidationError(`${field} must be a whole number from ${min} to ${max}.`);
  return number;
}
