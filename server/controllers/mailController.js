/**
 * Recruiter mail noticed in the user's inbox (services/gmail/replyWatcher.js).
 * The user confirms what it means; nothing changes on its own.
 */
const args = require("../utils/args");
const { NotFoundError, ValidationError } = require("../utils/errors");
const { STATUSES, changeStatus } = require("../services/applicationService");

exports.list = (req, res) => {
  res.json({ replies: req.ctx.store.mailMatches.listNew() });
};

/** Moves the application to `status` (the suggestion, or what the user picked) and files the reply away. */
exports.apply = async (req, res) => {
  const ctx = req.ctx;
  const match = requireMatch(ctx, req.params);
  const status = args.oneOf(req.body ?? {}, "status", STATUSES) ?? match.suggested_status;
  if (!status) throw new ValidationError("Pick the status this email means.");
  if (!match.application_id) throw new ValidationError("This email is not linked to an application.");

  const { application } = await changeStatus(ctx, match.application_id, status, `Email: ${match.subject}`.slice(0, 300));
  res.json({ reply: ctx.store.mailMatches.setState(match.id, "applied"), application });
};

exports.dismiss = (req, res) => {
  const ctx = req.ctx;
  res.json({ reply: ctx.store.mailMatches.setState(requireMatch(ctx, req.params).id, "dismissed") });
};

function requireMatch(ctx, params) {
  const id = args.id(params, "id", { required: true });
  const match = ctx.store.mailMatches.get(id);
  if (!match) throw new NotFoundError(`Reply #${id} does not exist.`);
  return match;
}
