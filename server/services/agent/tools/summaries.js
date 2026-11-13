/**
 * Short shapes of database rows for tool results and the prompt snapshot.
 * They keep only what the model needs, with times in the user's timezone.
 */
const { formatLocal } = require("../../../utils/time");

function summarizeApplication(application) {
  return {
    id: application.id,
    company: application.company,
    role: application.role,
    status: application.status,
    applied_on: application.applied_on,
    url: application.url,
    has_job_description: application.has_jd,
    resume: application.resume_filename ?? null,
    missing: application.missing,
  };
}

function summarizeReminder(ctx, reminder) {
  return {
    id: reminder.id,
    kind: reminder.kind,
    message: reminder.message,
    due: formatLocal(reminder.due_at, ctx.config.timezone),
    status: reminder.status,
  };
}

module.exports = { summarizeApplication, summarizeReminder };
