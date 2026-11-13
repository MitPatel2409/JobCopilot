const args = require("../utils/args");
const { NotFoundError, ValidationError } = require("../utils/errors");
const { logStudy, deleteTopic } = require("../services/studyService");

exports.list = (req, res) => {
  res.json({ topics: req.ctx.store.topics.list() });
};

/** Logs a study session from the form; revisions are scheduled as they are from chat. */
exports.create = async (req, res) => {
  const ctx = req.ctx;
  const body = req.body ?? {};

  const { topic, revisions, scheduled } = await logStudy(ctx, {
    topic: args.text(body, "name", { required: true, max: 120 }),
    note: args.text(body, "note", { max: 10000 }) ?? "",
    studiedOn: args.date(body, "studied_on"),
  });
  if (topic.last_studied === ctx.today()) ctx.store.journal.append(ctx.today(), `Studied ${topic.name}`);

  res.status(201).json({ topic, revisions, scheduled });
};

exports.get = (req, res) => {
  const ctx = req.ctx;
  const topic = requireTopic(ctx, args.id(req.params, "id", { required: true }));
  res.json({ topic, notes: ctx.store.topics.notes(topic.id), reminders: ctx.store.reminders.listByTopic(topic.id) });
};

/** Renames a topic or changes its plan (what to cover). */
exports.update = (req, res) => {
  const ctx = req.ctx;
  const topic = requireTopic(ctx, args.id(req.params, "id", { required: true }));
  const body = req.body ?? {};

  const name = args.text(body, "name", { max: 120 });
  if (name && name.toLowerCase() !== topic.name.toLowerCase() && ctx.store.topics.findByName(name)) {
    throw new ValidationError(`You already have a topic called "${name}".`);
  }
  if (name) ctx.store.topics.rename(topic.id, name);
  if (typeof body.plan === "string") ctx.store.topics.setPlan(topic.id, body.plan.trim().slice(0, 10000));
  res.json({ topic: ctx.store.topics.get(topic.id) });
};

/** Deletes a topic with its notes and revisions. */
exports.remove = async (req, res) => {
  await deleteTopic(req.ctx, requireTopic(req.ctx, args.id(req.params, "id", { required: true })).id);
  res.status(204).end();
};

exports.addNote = (req, res) => {
  const ctx = req.ctx;
  const topic = requireTopic(ctx, args.id(req.params, "id", { required: true }));
  const note = ctx.store.topics.addNote({
    topicId: topic.id,
    body: args.text(req.body ?? {}, "body", { required: true, max: 10000 }),
    studiedOn: args.date(req.body ?? {}, "studied_on") ?? ctx.today(),
  });
  res.status(201).json({ note });
};

exports.updateNote = (req, res) => {
  const ctx = req.ctx;
  const note = requireNote(ctx, req.params);
  const body = req.body ?? {};
  res.json({
    note: ctx.store.topics.updateNote(note.id, {
      body: args.text(body, "body", { max: 10000 }),
      studiedOn: args.date(body, "studied_on"),
    }),
  });
};

exports.removeNote = (req, res) => {
  const ctx = req.ctx;
  ctx.store.topics.deleteNote(requireNote(ctx, req.params).id);
  res.status(204).end();
};

function requireNote(ctx, params) {
  const topic = requireTopic(ctx, args.id(params, "id", { required: true }));
  const id = args.id(params, "noteId", { required: true });
  const note = ctx.store.topics.getNote(id);
  if (!note || note.topic_id !== topic.id) throw new NotFoundError(`Note #${id} does not exist.`);
  return note;
}

function requireTopic(ctx, id) {
  const topic = ctx.store.topics.get(id);
  if (!topic) throw new NotFoundError(`Topic #${id} does not exist.`);
  return topic;
}
