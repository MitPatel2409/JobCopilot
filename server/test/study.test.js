const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext } = require("./helpers/testContext");
const { logStudy } = require("../services/studyService");
const { completeReminder } = require("../services/reminderService");

test("studying a topic schedules revisions 1, 3, 7 and 21 days later", async () => {
  const ctx = createTestContext();
  const { topic, revisions, scheduled } = await logStudy(ctx, { topic: "Docker", note: "Volumes vs bind mounts" });

  assert.equal(scheduled, true);
  assert.equal(topic.note_count, 1);
  assert.deepEqual(
    revisions.map((r) => r.due_at.slice(0, 10)),
    ["2026-10-30", "2026-11-01", "2026-11-05", "2026-11-19"],
  );
  assert.deepEqual(revisions.map((r) => r.revision_stage), [1, 2, 3, 4]);
  assert.equal(revisions[0].message, "Revise Docker (1/4)");
});

test("studying again while revisions are pending adds the note without rescheduling", async () => {
  const ctx = createTestContext();
  await logStudy(ctx, { topic: "Docker", note: "Volumes" });
  const second = await logStudy(ctx, { topic: "docker", note: "Networking" });

  assert.equal(second.scheduled, false);
  assert.equal(second.topic.note_count, 2);
  assert.equal(ctx.store.topics.list().length, 1);
  assert.equal(ctx.store.reminders.listPending().length, 4);
});

test("once every revision is done, studying again starts a new cycle", async () => {
  const ctx = createTestContext();
  const first = await logStudy(ctx, { topic: "Docker" });
  for (const reminder of first.revisions) await completeReminder(ctx, reminder.id);

  ctx.setNow("2026-11-20T18:00:00Z");
  const again = await logStudy(ctx, { topic: "Docker", note: "Compose" });
  assert.equal(again.scheduled, true);
  assert.equal(again.revisions.length, 4);
  assert.equal(again.revisions[0].due_at.slice(0, 10), "2026-11-21");
});

test("logging a study session from the past skips revisions already gone by", async () => {
  const ctx = createTestContext();
  const { revisions } = await logStudy(ctx, { topic: "Kafka", studiedOn: "2026-10-24" });
  // Oct 25 and Oct 27 are past; Oct 31 and Nov 14 remain.
  assert.deepEqual(revisions.map((r) => r.revision_stage), [3, 4]);
});
