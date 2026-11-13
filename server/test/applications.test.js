const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext, createFakeCalendar } = require("./helpers/testContext");
const { logApplication, updateApplication, changeStatus, deleteApplication } = require("../services/applicationService");

test("logging an application schedules a follow-up 7 days later at 9:00 local", async () => {
  const ctx = createTestContext();
  const { application, created, followUp } = await logApplication(ctx, { company: "RBC", role: "Amplify Intern" });

  assert.equal(created, true);
  assert.equal(application.applied_on, "2026-10-29");
  assert.equal(application.status, "applied");
  assert.equal(followUp.kind, "follow_up");
  assert.equal(followUp.due_at, "2026-11-05T14:00:00.000Z"); // 09:00 EST
  assert.match(followUp.message, /RBC – Amplify Intern/);
});

test("a new application reports the job link and recruiter as missing", async () => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC", role: "Amplify Intern" });
  assert.deepEqual(application.missing, ["url", "contact", "jd"]);

  ctx.store.contacts.create({ applicationId: application.id, name: "Priya" });
  const withUrl = ctx.store.applications.update(application.id, { url: "https://jobs.rbc.com/1" });
  assert.deepEqual(withUrl.missing, ["jd"]);

  const other = await logApplication(ctx, { company: "Shopify" });
  assert.deepEqual(ctx.store.applications.update(other.application.id, { no_url: 1, no_contact: 1 }).missing, ["jd"]);
});

test("logging the same company and role again does not duplicate it", async () => {
  const ctx = createTestContext();
  const first = await logApplication(ctx, { company: "RBC", role: "Amplify Intern" });
  const second = await logApplication(ctx, { company: "rbc", role: "amplify intern", url: "https://jobs.rbc.com/1" });

  assert.equal(second.created, false);
  assert.equal(second.application.id, first.application.id);
  assert.equal(second.application.url, "https://jobs.rbc.com/1");
  assert.equal(ctx.store.reminders.listPending().length, 1);
});

test("a late-logged application gets its follow-up tomorrow; a much older one gets none", async () => {
  const ctx = createTestContext(); // 2026-10-29
  const { followUp } = await logApplication(ctx, { company: "TD", appliedOn: "2026-10-18" });
  assert.equal(followUp.due_at, "2026-10-30T13:00:00.000Z"); // tomorrow 09:00 EDT, not Oct 25

  const old = await logApplication(ctx, { company: "BMO", appliedOn: "2026-10-01" });
  assert.equal(old.followUp, null);
  assert.equal(ctx.store.reminders.pendingForApplication(old.application.id, "follow_up").length, 0);
});

test("the same title with a different posting link is a second application", async () => {
  const ctx = createTestContext();
  const first = await logApplication(ctx, { company: "Qualcomm", role: "AI Co-op", url: "https://careers.qualcomm.com/job/1" });
  const second = await logApplication(ctx, { company: "qualcomm", role: "ai co-op", url: "https://careers.qualcomm.com/job/2" });
  assert.equal(second.created, true);
  assert.notEqual(second.application.id, first.application.id);

  const again = await logApplication(ctx, { company: "Qualcomm", role: "AI Co-op", url: "http://www.careers.qualcomm.com/job/2/?utm_source=x" });
  assert.equal(again.created, false);
  assert.equal(again.application.id, second.application.id);
  assert.equal((await logApplication(ctx, { company: "Qualcomm", role: "AI Co-op" })).created, false, "no link: the same one");
});

test("changing the applied date moves the follow-up; renaming renames its reminders", async () => {
  const calendar = createFakeCalendar();
  const ctx = createTestContext({ calendar });
  const { application } = await logApplication(ctx, { company: "RBC", role: "Intern" });

  await updateApplication(ctx, application.id, { applied_on: "2026-10-27", role: "Amplify Intern" });
  const [followUp] = ctx.store.reminders.pendingForApplication(application.id, "follow_up");
  assert.equal(followUp.due_at, "2026-11-03T14:00:00.000Z"); // Oct 27 + 7 days, 09:00 EST
  assert.equal(followUp.message, "Follow up on RBC – Amplify Intern");
  assert.equal(calendar.calls.at(-1).name, "update");
  assert.equal(calendar.calls.at(-1).event.summary, "Follow up on RBC – Amplify Intern");

  await updateApplication(ctx, application.id, { applied_on: "2026-09-01" });
  assert.equal(ctx.store.reminders.pendingForApplication(application.id, "follow_up").length, 0, "too old now: dropped");
});

test("an interview date makes one interview reminder that follows the date, the name and the status", async () => {
  const calendar = createFakeCalendar();
  const ctx = createTestContext({ calendar });
  const { application } = await logApplication(ctx, { company: "RBC", role: "Amplify" });
  const interviews = () => ctx.store.reminders.pendingTagged(application.id, "interview");

  await changeStatus(ctx, application.id, "interview");
  await updateApplication(ctx, application.id, { interview_on: "2026-11-05" });
  assert.deepEqual(interviews().map((r) => [r.message, r.due_at]), [["Interview: RBC – Amplify", "2026-11-05T14:00:00.000Z"]]);

  await updateApplication(ctx, application.id, { interview_on: "2026-11-06", role: "Amplify Intern" });
  assert.deepEqual(interviews().map((r) => [r.message, r.due_at]), [["Interview: RBC – Amplify Intern", "2026-11-06T14:00:00.000Z"]]);

  await changeStatus(ctx, application.id, "rejected");
  assert.equal(interviews().length, 0, "nothing to prepare for after a rejection");

  await changeStatus(ctx, application.id, "interview");
  assert.equal(interviews().length, 1, "back on: the date is still set");
  await updateApplication(ctx, application.id, { interview_on: null });
  assert.equal(interviews().length, 0);

  await updateApplication(ctx, application.id, { interview_on: "2026-10-20" });
  assert.equal(interviews().length, 0, "no reminder for an interview in the past");
});

test("putting an application back on applied (a mistake) brings its follow-up back", async () => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "CIBC" });
  await changeStatus(ctx, application.id, "oa");
  assert.equal(ctx.store.reminders.pendingForApplication(application.id, "follow_up").length, 0);

  await changeStatus(ctx, application.id, "applied");
  const [followUp] = ctx.store.reminders.pendingForApplication(application.id, "follow_up");
  assert.equal(followUp.due_at, "2026-11-05T14:00:00.000Z");
});

test("moving forward records the change and cancels the follow-up", async () => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC", role: "Amplify Intern" });

  const result = await changeStatus(ctx, application.id, "interview", "Technical round Nov 3");
  assert.equal(result.application.status, "interview");
  assert.equal(result.cancelledFollowUps, 1);
  assert.equal(ctx.store.reminders.listPending().length, 0);

  const history = ctx.store.statusEvents.listByApplication(application.id);
  assert.deepEqual(history.map((e) => [e.from_status, e.to_status]), [[null, "applied"], ["applied", "interview"]]);
  assert.equal(history[1].note, "Technical round Nov 3");
});

test("an unknown status is rejected", async () => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC" });
  await assert.rejects(changeStatus(ctx, application.id, "hired"), /status must be one of/);
});

test("search matches words across company and role", async () => {
  const ctx = createTestContext();
  await logApplication(ctx, { company: "RBC", role: "Amplify Intern" });
  await logApplication(ctx, { company: "Shopify", role: "Backend Developer Intern" });

  assert.deepEqual(ctx.store.applications.search("rbc amplify").map((a) => a.company), ["RBC"]);
  assert.deepEqual(ctx.store.applications.search("amplify").map((a) => a.company), ["RBC"]);
  assert.equal(ctx.store.applications.search("intern").length, 2);
});

test("calendar: follow-up becomes an event, cancelling it deletes the event", async () => {
  const calendar = createFakeCalendar();
  const ctx = createTestContext({ calendar });
  const { application, followUp } = await logApplication(ctx, {
    company: "RBC",
    role: "Amplify Intern",
    url: "https://jobs.rbc.com/1",
  });

  assert.equal(followUp.calendar_event_id, "event-1");
  assert.equal(calendar.calls[0].name, "create");
  assert.match(calendar.calls[0].event.description, /https:\/\/jobs\.rbc\.com\/1/);

  await changeStatus(ctx, application.id, "oa");
  assert.deepEqual(calendar.calls[1], { name: "delete", eventId: "event-1" });
});

test("calendar: a failing calendar never loses the reminder", async (t) => {
  t.mock.method(console, "warn", () => {});
  const ctx = createTestContext({ calendar: createFakeCalendar({ failWith: "quota exceeded" }) });
  const { followUp } = await logApplication(ctx, { company: "RBC" });

  assert.equal(followUp.calendar_event_id, null);
  assert.equal(ctx.store.reminders.listPending().length, 1);
});

test("deleting an application removes its reminders and their calendar events", async () => {
  const calendar = createFakeCalendar();
  const ctx = createTestContext({ calendar });
  const { application } = await logApplication(ctx, { company: "RBC" });

  await deleteApplication(ctx, application.id);
  assert.equal(ctx.store.applications.get(application.id), null);
  assert.equal(ctx.store.reminders.listPending().length, 0);
  assert.deepEqual(calendar.calls.map((c) => c.name), ["create", "delete"]);
});
