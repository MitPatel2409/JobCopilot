const args = require("../utils/args");
const { NotFoundError } = require("../utils/errors");
const { requireApplication } = require("../services/applicationService");

/** Adds a recruiter or referral to an application from the form. */
exports.create = (req, res) => {
  const ctx = req.ctx;
  const application = requireApplication(ctx, args.id(req.params, "id", { required: true }));
  const body = req.body ?? {};
  const contact = ctx.store.contacts.create({
    applicationId: application.id,
    name: args.text(body, "name", { required: true, max: 200 }),
    title: args.text(body, "title", { max: 200 }) ?? "",
    linkedinUrl: args.url(body, "linkedin_url") ?? null,
    email: args.email(body, "email") ?? null,
  });
  res.status(201).json({ contact });
};

/** An empty string clears a field. */
exports.update = (req, res) => {
  const ctx = req.ctx;
  const id = requireContact(ctx, req.params).id;
  const body = req.body ?? {};
  const contact = ctx.store.contacts.update(id, {
    name: args.text(body, "name", { max: 200 }),
    title: body.title === "" ? "" : args.text(body, "title", { max: 200 }),
    linkedin_url: body.linkedin_url === "" ? null : args.url(body, "linkedin_url"),
    email: body.email === "" ? null : args.email(body, "email"),
  });
  res.json({ contact });
};

exports.remove = (req, res) => {
  const ctx = req.ctx;
  ctx.store.contacts.delete(requireContact(ctx, req.params).id);
  res.status(204).end();
};

function requireContact(ctx, params) {
  const id = args.id(params, "id", { required: true });
  const contact = ctx.store.contacts.get(id);
  if (!contact) throw new NotFoundError(`Contact #${id} does not exist.`);
  return contact;
}
