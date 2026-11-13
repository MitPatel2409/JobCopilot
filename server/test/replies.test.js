const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext, createFakeGmail } = require("./helpers/testContext");
const { createFakeLlm } = require("./helpers/fakeLlm");
const { startServer } = require("./helpers/server");
const { logApplication } = require("../services/applicationService");
const { checkReplies } = require("../services/gmail/replyWatcher");
const { createScheduler } = require("../services/scheduler/scheduler");

const INBOX = [
  { id: "m1", from: "Yeena Kim <yeena@rbc.com>", subject: "Interview invitation", snippet: "We'd like to schedule a call", receivedAt: "2026-10-29T15:00:00.000Z" },
  { id: "m2", from: "Someone <someone@else.com>", subject: "Newsletter", snippet: "", receivedAt: "2026-10-29T15:00:00.000Z" },
];

async function setUp({ suggestion = "interview" } = {}) {
  const gmail = createFakeGmail({ inbox: INBOX.map((message) => ({ ...message })) });
  const llm = createFakeLlm({ jsonResponses: { classify_reply: { status: suggestion } } });
  const ctx = createTestContext({ gmail, llm });
  const { application } = await logApplication(ctx, { company: "RBC", role: "Amplify" });
  ctx.store.contacts.create({ applicationId: application.id, name: "Yeena", email: "yeena@rbc.com" });
  return { ctx, gmail, llm, application };
}

test("mail from a saved recruiter is noticed once, with a suggested status", async () => {
  const { ctx, gmail, llm, application } = await setUp();

  const found = await checkReplies(ctx, ctx.clock());
  assert.equal(found.length, 1);
  assert.equal(found[0].application_id, application.id);
  assert.equal(found[0].suggested_status, "interview");
  assert.equal(found[0].subject, "Interview invitation");
  assert.match(gmail.queries[0], /^from:\(yeena@rbc\.com\) after:\d+$/);
  assert.match(llm.jsonCalls[0].prompt, /Subject: Interview invitation/);
  assert.deepEqual(ctx.published.map((event) => event.type), ["mail_matches"]);

  assert.equal((await checkReplies(ctx, ctx.clock())).length, 0, "not again within 15 minutes");
  ctx.setNow("2026-10-29T18:30:00Z");
  assert.equal((await checkReplies(ctx, ctx.clock())).length, 0, "the same message is not stored twice");
  assert.equal(ctx.store.mailMatches.listNew().length, 1);
  assert.equal(ctx.store.applications.get(application.id).status, "applied", "nothing changes on its own");
});

test("a reply that changes nothing gets no suggestion", async () => {
  const { ctx } = await setUp({ suggestion: "none" });
  const [match] = await checkReplies(ctx, ctx.clock());
  assert.equal(match.suggested_status, null);
});

test("without the Gmail reading service, nothing is checked", async () => {
  const ctx = createTestContext();
  assert.deepEqual(await checkReplies(ctx, ctx.clock()), []);
});

test("the scheduler checks every signed-up user's inbox", async () => {
  const { ctx } = await setUp();
  await createScheduler(ctx.app).tick();
  assert.equal(ctx.store.mailMatches.listNew().length, 1);
});

test("on Today: apply the suggested status (which offers a prep guide) or dismiss", async (t) => {
  const { ctx, application } = await setUp();
  await checkReplies(ctx, ctx.clock());
  const request = await startServer(t, ctx);

  const today = await request("/today");
  assert.equal(today.json.replies.length, 1);
  assert.equal(today.json.replies[0].company, "RBC");
  const id = today.json.replies[0].id;

  const applied = await request(`/mail-matches/${id}/apply`, { method: "POST" });
  assert.equal(applied.json.application.status, "interview");
  assert.equal(applied.json.reply.state, "applied");
  const detail = await request(`/applications/${application.id}`);
  assert.equal(detail.json.statusEvents.at(-1).note, "Email: Interview invitation");
  assert.equal((await request("/today")).json.replies.length, 0);

  ctx.setNow("2026-10-29T19:00:00Z");
  ctx.store.mailMatches.create({ messageId: "m9", applicationId: application.id, contactId: null, sender: "x", subject: "FYI", snippet: "", receivedAt: "2026-10-29T18:50:00Z", suggestedStatus: null });
  const [fyi] = ctx.store.mailMatches.listNew();
  assert.equal((await request(`/mail-matches/${fyi.id}/apply`, { method: "POST" })).status, 400, "no suggestion and none picked");
  assert.equal((await request(`/mail-matches/${fyi.id}/dismiss`, { method: "POST" })).json.reply.state, "dismissed");
});
