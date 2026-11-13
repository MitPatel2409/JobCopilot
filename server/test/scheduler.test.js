const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext, createFakeMailer } = require("./helpers/testContext");
const { createScheduler } = require("../services/scheduler/scheduler");
const { logApplication } = require("../services/applicationService");
const { logStudy } = require("../services/studyService");

test("a due reminder is pushed to the browser once", async () => {
  const ctx = createTestContext();
  await logStudy(ctx, { topic: "Docker" }); // first revision 2026-10-30 09:00 EDT
  const scheduler = createScheduler(ctx.app);

  await scheduler.tick();
  assert.equal(ctx.published.length, 0);

  ctx.setNow("2026-10-30T13:01:00Z");
  await scheduler.tick();
  await scheduler.tick();

  const due = ctx.published.filter((e) => e.type === "reminder_due");
  assert.equal(due.length, 1);
  assert.equal(due[0].reminder.message, "Revise Docker (1/4)");
  assert.equal(due[0].reminder.topic, "Docker");
});

test("the digest is emailed once a day after DIGEST_HOUR", async () => {
  const mailer = createFakeMailer();
  const ctx = createTestContext({ now: "2026-11-05T12:00:00Z", mailer }); // 07:00 EST
  await logApplication(ctx, { company: "RBC", role: "Amplify Intern", appliedOn: "2026-10-29", url: "https://jobs.rbc.com/1" });
  const scheduler = createScheduler(ctx.app);

  await scheduler.tick();
  assert.equal(mailer.sent.length, 0, "too early");

  ctx.setNow("2026-11-05T14:30:00Z"); // 09:30 EST
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(mailer.sent.length, 1);
  assert.match(mailer.sent[0].subject, /1 due today/);
  assert.match(mailer.sent[0].text, /Follow up on RBC – Amplify Intern/);
  assert.match(mailer.sent[0].html, /href="https:\/\/jobs\.rbc\.com\/1"/);

  ctx.setNow("2026-11-06T14:30:00Z");
  await scheduler.tick();
  assert.equal(mailer.sent.length, 2, "the next day gets its own digest");
});

test("the digest lists applications with no news for 21 days", async () => {
  const mailer = createFakeMailer();
  const ctx = createTestContext({ now: "2026-11-25T15:00:00Z", mailer });
  await logApplication(ctx, { company: "TD", appliedOn: "2026-10-20" });

  await createScheduler(ctx.app).tick();
  assert.match(mailer.sent[0].text, /No news for 21\+ days[\s\S]*TD, applied 2026-10-20/);
});

test("a failing mail server is not retried every minute", async (t) => {
  t.mock.method(console, "error", () => {});
  const ctx = createTestContext({ now: "2026-11-05T12:00:00Z", mailer: createFakeMailer({ failWith: "auth failed" }) });
  await logApplication(ctx, { company: "RBC", appliedOn: "2026-10-29" }); // follow-up due 09:00 today
  ctx.setNow("2026-11-05T15:00:00Z");
  const scheduler = createScheduler(ctx.app);

  await scheduler.tick();
  await scheduler.tick();
  assert.equal(console.error.mock.callCount(), 1);
});

test("the evening nudge fires only when nothing was logged today", async () => {
  const ctx = createTestContext({ now: "2026-10-30T00:30:00Z" }); // 20:30 EDT on Oct 29
  const scheduler = createScheduler(ctx.app);

  await scheduler.tick();
  await scheduler.tick();
  assert.deepEqual(ctx.published.map((e) => e.type), ["nudge"]);

  const quiet = createTestContext({ now: "2026-10-30T00:30:00Z" });
  quiet.store.journal.append("2026-10-29", "Studied Docker");
  await createScheduler(quiet.app).tick();
  assert.equal(quiet.published.length, 0);
});
