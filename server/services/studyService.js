/**
 * Study log with spaced revision: studying a topic schedules reminders to
 * revise it 1, 3, 7 and 21 days later.
 */
const { addDays, zonedToUtc } = require("../utils/time");
const { createReminder, cancelReminder } = require("./reminderService");

const REVISION_DAYS = [1, 3, 7, 21];

/**
 * Records that the user studied `topic` on `studiedOn`, with an optional note.
 * If the topic still has revisions pending, they are kept as they are; once
 * a cycle is over, studying the topic again starts a new one.
 */
async function logStudy(ctx, { topic: name, note = "", studiedOn }) {
  const date = studiedOn ?? ctx.today();
  let topic = ctx.store.topics.findByName(name);
  const createdTopic = !topic;
  if (!topic) topic = ctx.store.topics.create(name);

  const savedNote = note ? ctx.store.topics.addNote({ topicId: topic.id, body: note, studiedOn: date }) : null;
  if (!savedNote && createdTopic) {
    // Keep the study date even without a note, so "last studied" is right.
    ctx.store.topics.addNote({ topicId: topic.id, body: "(studied)", studiedOn: date });
  }

  const pending = ctx.store.reminders.pendingForTopic(topic.id);
  if (pending.length > 0) {
    return { topic: ctx.store.topics.get(topic.id), note: savedNote, revisions: pending, scheduled: false };
  }

  const revisions = [];
  for (const [index, days] of REVISION_DAYS.entries()) {
    const day = addDays(date, days);
    if (day < ctx.today()) continue; // logging an old session: skip revisions already past
    revisions.push(
      await createReminder(ctx, {
        kind: "revision",
        topicId: topic.id,
        revisionStage: index + 1,
        message: `Revise ${topic.name} (${index + 1}/${REVISION_DAYS.length})`,
        dueAt: zonedToUtc(day, ctx.config.reminderHour, 0, ctx.config.timezone).toISOString(),
      }),
    );
  }

  return { topic: ctx.store.topics.get(topic.id), note: savedNote, revisions, scheduled: true };
}

/** Deletes a topic, its notes and reminders, removing pending reminders from the calendar first. */
async function deleteTopic(ctx, topicId) {
  for (const reminder of ctx.store.reminders.pendingForTopic(topicId)) {
    await cancelReminder(ctx, reminder.id);
  }
  ctx.store.topics.delete(topicId);
}

module.exports = { REVISION_DAYS, logStudy, deleteTopic };
