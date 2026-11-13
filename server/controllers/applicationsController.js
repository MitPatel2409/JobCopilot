const args = require("../utils/args");
const { NotFoundError } = require("../utils/errors");
const {
  STATUSES,
  logApplication,
  updateApplication,
  changeStatus,
  deleteApplication,
  requireApplication,
  describe,
} = require("../services/applicationService");
const { saveJobDescription, fetchJobDescription } = require("../services/jobDescriptionService");
const { saveResume, copyResume } = require("../services/documentService");
const { createPrepGuide, addPrepTopics } = require("../services/prepGuideService");
const { sendDocument } = require("../middleware/upload");

exports.list = (req, res) => {
  const ctx = req.ctx;
  const status = args.oneOf(req.query, "status", STATUSES);
  const query = args.text(req.query, "q", { max: 200 });
  const applications = query
    ? ctx.store.applications.search(query).filter((a) => !status || a.status === status)
    : ctx.store.applications.list({ status });
  res.json({ applications });
};

/** One application with everything about it: history, people, messages, reminders, JD, résumé and prep guide. */
exports.get = (req, res) => {
  const ctx = req.ctx;
  const application = requireApplication(ctx, args.id(req.params, "id", { required: true }));
  res.json({
    application,
    contacts: ctx.store.contacts.listByApplication(application.id),
    outreach: ctx.store.outreach.listByApplication(application.id),
    statusEvents: ctx.store.statusEvents.listByApplication(application.id),
    reminders: ctx.store.reminders.listByApplication(application.id),
    resume: ctx.store.documents.info(application.id),
    baseResume: ctx.store.documents.info(null),
    prepGuide: ctx.store.prepGuides.get(application.id),
  });
};

/**
 * Adds an application from the form. Like the assistant, it schedules the
 * follow-up and returns the existing row when the company and role match one.
 */
exports.create = async (req, res) => {
  const ctx = req.ctx;
  const body = req.body ?? {};

  const { application, created } = await logApplication(ctx, {
    company: args.text(body, "company", { required: true, max: 200 }),
    role: args.text(body, "role", { max: 200 }) ?? "",
    url: args.url(body, "url") ?? null,
    appliedOn: args.date(body, "applied_on"),
    notes: args.text(body, "notes") ?? "",
  });
  if (created && application.applied_on === ctx.today()) {
    ctx.store.journal.append(ctx.today(), `Applied to ${describe(application)}`);
  }
  const jd = args.text(body, "jd_text", { max: 30000 });
  const saved = created && jd ? saveJobDescription(ctx, application.id, jd) : application;

  res.status(created ? 201 : 200).json({ application: saved, created });
};

/** Manual edits from the UI, so a mistake by the assistant can be fixed. */
exports.update = async (req, res) => {
  const ctx = req.ctx;
  const id = args.id(req.params, "id", { required: true });
  requireApplication(ctx, id);
  const body = req.body ?? {};

  await updateApplication(ctx, id, {
    company: args.text(body, "company", { max: 200 }),
    role: body.role === "" ? "" : args.text(body, "role", { max: 200 }),
    url: body.url === "" ? null : args.url(body, "url"),
    applied_on: args.date(body, "applied_on"),
    notes: body.notes === "" ? "" : args.text(body, "notes"),
    interview_on: body.interview_on === "" ? null : args.date(body, "interview_on"),
  });

  const status = args.oneOf(body, "status", STATUSES);
  if (status) await changeStatus(ctx, id, status, args.text(body, "note", { max: 1000 }) ?? "");

  res.json({ application: ctx.store.applications.get(id) });
};

exports.remove = async (req, res) => {
  await deleteApplication(req.ctx, args.id(req.params, "id", { required: true }));
  res.status(204).end();
};

// --- Job description -------------------------------------------------------

exports.saveJd = (req, res) => {
  const application = saveJobDescription(req.ctx, args.id(req.params, "id", { required: true }), req.body?.text ?? "");
  res.json({ application });
};

/** Downloads the posting and returns the description for the user to check; nothing is saved yet. */
exports.fetchJd = async (req, res) => {
  const ctx = req.ctx;
  const application = requireApplication(ctx, args.id(req.params, "id", { required: true }));
  const url = args.url(req.body ?? {}, "url") ?? application.url;
  if (!url) return res.status(400).json({ error: "Add the posting link first." });
  res.json({ text: await fetchJobDescription(url), url });
};

// --- Tailored résumé -------------------------------------------------------

exports.uploadResume = async (req, res) => {
  const ctx = req.ctx;
  const application = requireApplication(ctx, args.id(req.params, "id", { required: true }));
  res.status(201).json({ resume: await saveResume(ctx, application.id, req.file) });
};

/** Uses the résumé of another application (`from_application_id`), or the base one (`from_application_id: null`). */
exports.copyResume = (req, res) => {
  const ctx = req.ctx;
  const body = req.body ?? {};
  const from = body.from_application_id === null ? null : args.id(body, "from_application_id", { required: true });
  res.status(201).json({ resume: copyResume(ctx, args.id(req.params, "id", { required: true }), from) });
};

exports.downloadResume = (req, res) => {
  const ctx = req.ctx;
  const application = requireApplication(ctx, args.id(req.params, "id", { required: true }));
  const document = ctx.store.documents.file(application.id);
  if (!document) throw new NotFoundError("No résumé saved for this application.");
  sendDocument(res, document);
};

exports.deleteResume = (req, res) => {
  const ctx = req.ctx;
  const application = requireApplication(ctx, args.id(req.params, "id", { required: true }));
  ctx.store.documents.delete(application.id);
  res.status(204).end();
};

// --- Interview prep guide --------------------------------------------------

exports.createPrepGuide = async (req, res) => {
  res.status(201).json({ prepGuide: await createPrepGuide(req.ctx, args.id(req.params, "id", { required: true })) });
};

/** Puts the topics the user ticked into the study plan. */
exports.addPrepTopics = async (req, res) => {
  const ctx = req.ctx;
  const id = args.id(req.params, "id", { required: true });
  const body = req.body ?? {};
  const names = Array.isArray(body.topics) ? body.topics.filter((name) => typeof name === "string" && name.trim()) : [];

  const added = await addPrepTopics(ctx, id, { names, interviewOn: args.date(body, "interview_on") });
  ctx.store.journal.append(ctx.today(), `Planned interview prep for ${describe(ctx.store.applications.get(id))}`);
  res.status(201).json({ added, prepGuide: ctx.store.prepGuides.get(id) });
};
