const args = require("../utils/args");
const { NotFoundError, ValidationError } = require("../utils/errors");
const { requireApplication } = require("../services/applicationService");

const CHANNELS = ["email", "linkedin"];

/** Saves a message the user wrote themselves, as a draft or as already sent. */
exports.create = (req, res) => {
  const ctx = req.ctx;
  const application = requireApplication(ctx, args.id(req.params, "id", { required: true }));
  const body = req.body ?? {};
  const contactId = args.id(body, "contact_id");
  if (contactId && !ctx.store.contacts.get(contactId)) throw new ValidationError(`Contact #${contactId} does not exist.`);
  const sent = args.oneOf(body, "status", ["draft", "sent"]) === "sent";

  const outreach = ctx.store.outreach.create({
    applicationId: application.id,
    contactId: contactId ?? null,
    channel: args.oneOf(body, "channel", CHANNELS) ?? "email",
    subject: args.text(body, "subject", { max: 300 }) ?? "",
    body: args.text(body, "body", { required: true, max: 10000 }),
    status: sent ? "sent" : "draft",
    sentOn: sent ? args.date(body, "sent_on") ?? ctx.today() : null,
  });
  res.status(201).json({ outreach });
};

/** Edit a draft, or mark it sent after sending it yourself. */
exports.update = (req, res) => {
  const ctx = req.ctx;
  const id = requireOutreach(ctx, req.params).id;
  const body = req.body ?? {};
  const status = args.oneOf(body, "status", ["draft", "sent"]);
  const contactId = body.contact_id === null || body.contact_id === "" ? null : args.id(body, "contact_id");
  if (contactId && !ctx.store.contacts.get(contactId)) throw new ValidationError(`Contact #${contactId} does not exist.`);

  const outreach = ctx.store.outreach.update(id, {
    subject: body.subject === "" ? "" : args.text(body, "subject", { max: 300 }),
    body: args.text(body, "body", { max: 10000 }),
    channel: args.oneOf(body, "channel", CHANNELS),
    contact_id: contactId,
    status,
    sent_on: status === "sent" ? args.date(body, "sent_on") ?? ctx.today() : status === "draft" ? null : undefined,
  });
  res.json({ outreach });
};

exports.remove = (req, res) => {
  const ctx = req.ctx;
  ctx.store.outreach.delete(requireOutreach(ctx, req.params).id);
  res.status(204).end();
};

/** Copies an email draft into the user's Gmail Drafts folder. It is not sent. */
exports.gmailDraft = async (req, res) => {
  const ctx = req.ctx;
  const outreach = requireOutreach(ctx, req.params);
  if (!ctx.gmail?.createDraft) throw new ValidationError("Connect \"Save drafts to Gmail\" in Settings first.");
  if (outreach.channel !== "email") throw new ValidationError("Only email messages can be saved to Gmail.");

  const draftId = await ctx.gmail.createDraft({ to: outreach.contact_email ?? "", subject: outreach.subject, text: outreach.body });
  res.json({ outreach: ctx.store.outreach.update(outreach.id, { gmail_draft_id: draftId }) });
};

function requireOutreach(ctx, params) {
  const id = args.id(params, "id", { required: true });
  const outreach = ctx.store.outreach.get(id);
  if (!outreach) throw new NotFoundError(`Outreach #${id} does not exist.`);
  return outreach;
}
