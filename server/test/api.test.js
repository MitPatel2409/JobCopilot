const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext } = require("./helpers/testContext");
const { createFakeLlm, toolTurn } = require("./helpers/fakeLlm");
const { startServer } = require("./helpers/server");
const { logApplication, changeStatus } = require("../services/applicationService");

test("POST /chat streams tool events and a final reply", async (t) => {
  const llm = createFakeLlm({
    turns: [toolTurn(["log_application", { company: "RBC", role: "Amplify" }]), { text: "Saved! Link?", toolCalls: [] }],
  });
  const ctx = createTestContext({ llm });
  const request = await startServer(t, ctx);

  const { status, text } = await request("/chat", { method: "POST", body: { message: "applied to rbc amplify" } });
  assert.equal(status, 200);

  const events = text.trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(events.map((e) => e.type), ["tool_call", "tool_result", "thought", "done"]);
  assert.equal(events.at(-1).reply, "Saved! Link?");

  const history = await request("/chat/history");
  assert.equal(history.json.messages.length, 2);
});

test("POST /chat rejects an empty message", async (t) => {
  const request = await startServer(t, createTestContext());
  const { status, json } = await request("/chat", { method: "POST", body: { message: "  " } });
  assert.equal(status, 400);
  assert.equal(json.error, "Type a message first.");
});

test("applications: detail, manual edit with status change, and bad input", async (t) => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC", role: "Amplify" });
  const request = await startServer(t, ctx);

  const edited = await request(`/applications/${application.id}`, {
    method: "PATCH",
    body: { url: "jobs.rbc.com/amplify", status: "interview", note: "Nov 3" },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.application.url, "https://jobs.rbc.com/amplify");
  assert.equal(edited.json.application.status, "interview");

  const detail = await request(`/applications/${application.id}`);
  assert.equal(detail.json.statusEvents.length, 2);
  assert.equal(detail.json.reminders[0].status, "cancelled");

  assert.equal((await request("/applications/999")).status, 404);
  assert.equal((await request(`/applications/${application.id}`, { method: "PATCH", body: { status: "hired" } })).status, 400);
});

test("today: due reminders, upcoming ones, and done/snooze", async (t) => {
  const ctx = createTestContext();
  await logApplication(ctx, { company: "RBC", appliedOn: "2026-10-22" }); // follow-up due tomorrow (old application)
  const request = await startServer(t, ctx);

  let today = await request("/today");
  assert.equal(today.json.due.length, 0);
  assert.equal(today.json.upcoming.length, 1);

  const reminderId = today.json.upcoming[0].id;
  const snoozed = await request(`/reminders/${reminderId}/snooze`, { method: "POST", body: { until: "2026-11-02T10:00" } });
  assert.equal(snoozed.json.reminder.due_at, "2026-11-02T15:00:00.000Z");

  ctx.setNow("2026-11-02T16:00:00Z");
  today = await request("/today");
  assert.equal(today.json.due.length, 1);

  await request(`/reminders/${reminderId}/done`, { method: "POST" });
  today = await request("/today");
  assert.equal(today.json.due.length, 0);
});

test("POST /applications adds one with its follow-up, and does not duplicate", async (t) => {
  const ctx = createTestContext();
  const request = await startServer(t, ctx);

  const created = await request("/applications", { method: "POST", body: { company: "RBC", role: "Amplify", url: "jobs.rbc.com" } });
  assert.equal(created.status, 201);
  assert.equal(created.json.application.url, "https://jobs.rbc.com/");
  assert.equal(ctx.store.reminders.listPending().length, 1);
  assert.equal(ctx.store.journal.get("2026-10-29").summary, "Applied to RBC – Amplify");

  const again = await request("/applications", { method: "POST", body: { company: "rbc", role: "amplify" } });
  assert.equal(again.status, 200);
  assert.equal(again.json.created, false);
  assert.equal(ctx.store.applications.list().length, 1);

  assert.equal((await request("/applications", { method: "POST", body: { role: "Intern" } })).status, 400);
});

test("POST /reminders adds a custom reminder and rejects a past date", async (t) => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC" });
  const request = await startServer(t, ctx);

  const created = await request("/reminders", {
    method: "POST",
    body: { message: "Send thank-you note", due: "2026-10-30T17:00", application_id: application.id },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.reminder.kind, "custom");
  assert.equal(created.json.reminder.due_at, "2026-10-30T21:00:00.000Z");
  assert.equal(created.json.reminder.company, "RBC");

  assert.equal((await request("/reminders", { method: "POST", body: { message: "Late", due: "2026-10-01" } })).status, 400);
  assert.equal((await request("/reminders", { method: "POST", body: { message: "x", due: "2026-11-01", application_id: 99 } })).status, 404);
});

test("POST /topics logs a study session and schedules revisions", async (t) => {
  const ctx = createTestContext();
  const request = await startServer(t, ctx);

  const created = await request("/topics", { method: "POST", body: { name: "Docker", note: "Volumes" } });
  assert.equal(created.status, 201);
  assert.equal(created.json.topic.note_count, 1);
  assert.equal(created.json.revisions.length, 4);
  assert.equal(ctx.store.journal.get("2026-10-29").summary, "Studied Docker");
  assert.equal((await request("/topics", { method: "POST", body: {} })).status, 400);
});

test("GET /stats counts weeks, the funnel, replies and the streak", async (t) => {
  const ctx = createTestContext(); // Thursday 2026-10-29
  const rbc = await logApplication(ctx, { company: "RBC", appliedOn: "2026-10-27" });
  const shopify = await logApplication(ctx, { company: "Shopify", appliedOn: "2026-10-20" });
  const labatt = await logApplication(ctx, { company: "Labatt", appliedOn: "2026-10-19" });
  await changeStatus(ctx, labatt.application.id, "oa"); // a mistake, corrected on the next line
  await changeStatus(ctx, labatt.application.id, "applied");
  await changeStatus(ctx, rbc.application.id, "interview");
  await changeStatus(ctx, shopify.application.id, "rejected");
  ctx.store.journal.append("2026-10-28", "Applied to RBC");
  ctx.store.journal.append("2026-10-27", "Studied Docker");
  const request = await startServer(t, ctx);

  const { json } = await request("/stats");
  assert.equal(json.total, 3);
  assert.deepEqual(json.byStatus, { applied: 1, interview: 1, rejected: 1 });
  assert.equal(json.weekly.length, 8);
  assert.deepEqual(json.weekly.slice(-2), [
    { start: "2026-10-19", count: 2 },
    { start: "2026-10-26", count: 1 },
  ]);
  assert.deepEqual(json.funnel.map((stage) => stage.count), [3, 1, 1, 0]);
  assert.equal(json.replied, 2);
  assert.equal(json.streak, 2);

  const today = await request("/today");
  assert.equal(today.json.appliedThisWeek, 1);
});

test("Today lists applications quiet for three weeks with no follow-up waiting", async (t) => {
  const ctx = createTestContext(); // 2026-10-29
  const old = await logApplication(ctx, { company: "Amazon", appliedOn: "2026-09-22" });
  const recent = await logApplication(ctx, { company: "TD", appliedOn: "2026-10-20" });
  const answered = await logApplication(ctx, { company: "RBC", appliedOn: "2026-09-22" });
  await changeStatus(ctx, answered.application.id, "interview");
  const request = await startServer(t, ctx);

  let today = await request("/today");
  assert.deepEqual(today.json.quiet.map((a) => a.company), ["Amazon"]);
  assert.equal(recent.application.status, "applied");

  await request("/reminders", { method: "POST", body: { message: "Follow up on Amazon", due: "2026-10-30", application_id: old.application.id } });
  assert.deepEqual((await request("/today")).json.quiet, [], "a reminder is waiting");

  const other = await logApplication(ctx, { company: "Chess.com", appliedOn: "2026-09-28" });
  await request(`/applications/${other.application.id}`, { method: "PATCH", body: { status: "ghosted" } });
  today = await request("/today");
  assert.deepEqual(today.json.quiet, []);
});
