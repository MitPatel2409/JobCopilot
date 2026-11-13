const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext, createFakeCalendar } = require("./helpers/testContext");
const { createFakeLlm, toolTurn } = require("./helpers/fakeLlm");
const { startServer } = require("./helpers/server");
const { logApplication, changeStatus } = require("../services/applicationService");
const { saveJobDescription } = require("../services/jobDescriptionService");
const { createPrepGuide, addPrepTopics, studyDays } = require("../services/prepGuideService");
const { logStudy } = require("../services/studyService");
const { createToolbox } = require("../services/agent/tools");
const { runChat } = require("../services/agent/runChat");

const GUIDE = {
  summary: "Backend role focused on Java APIs and SQL.",
  topics: [
    { name: "REST API design", why: "The JD asks for REST services.", cover: ["Status codes", "Pagination"], priority: "high", on_resume: false },
    { name: "SQL joins and indexes", why: "Daily SQL work.", cover: ["Inner vs left join", "Index basics"], priority: "high", on_resume: true },
    { name: "Behavioural: teamwork", why: "Agile team.", cover: ["One conflict story"], priority: "medium", on_resume: false },
  ],
  questions: ["Design a URL shortener API."],
  gaps: ["Java"],
};

async function applicationWithJd(ctx) {
  const { application } = await logApplication(ctx, { company: "RBC", role: "Backend Intern" });
  saveJobDescription(ctx, application.id, "Build REST APIs in Java. Write SQL. Work in an agile team.");
  return application;
}

test("the guide is built from the job description and the résumé, and needs the JD", async () => {
  const llm = createFakeLlm({ jsonResponses: { prep_guide: GUIDE } });
  const ctx = createTestContext({ llm });
  const { application: bare } = await logApplication(ctx, { company: "TD" });
  await assert.rejects(createPrepGuide(ctx, bare.id), /Save the job description first/);

  const application = await applicationWithJd(ctx);
  ctx.store.documents.save(null, { filename: "base.pdf", mime: "application/pdf", content: Buffer.from("x"), text: "Base résumé: Python, Flask" });
  ctx.store.documents.save(application.id, { filename: "rbc.pdf", mime: "application/pdf", content: Buffer.from("y"), text: "Tailored: Java, Spring" });

  const guide = await createPrepGuide(ctx, application.id);
  assert.equal(guide.topics.length, 3);
  assert.equal(guide.used_resume, true);
  assert.ok(guide.topics.every((topic) => topic.added === false));

  const prompt = llm.jsonCalls.at(-1).prompt;
  assert.match(prompt, /Build REST APIs in Java/);
  assert.match(prompt, /Tailored: Java, Spring/, "the application's own résumé wins over the base one");
  assert.doesNotMatch(prompt, /Base résumé/);
});

test("picked topics become study topics with a plan and reminders before the interview", async () => {
  const calendar = createFakeCalendar();
  const ctx = createTestContext({ llm: createFakeLlm({ jsonResponses: { prep_guide: GUIDE } }), calendar });
  const application = await applicationWithJd(ctx);
  await logStudy(ctx, { topic: "sql joins and indexes", note: "Did joins last week" }); // already studying it
  await createPrepGuide(ctx, application.id);

  const added = await addPrepTopics(ctx, application.id, {
    names: ["REST API design", "SQL joins and indexes"],
    interviewOn: "2026-11-05",
  });

  assert.equal(added.length, 2);
  assert.equal(ctx.store.topics.list().length, 2, "the existing SQL topic was reused");
  const rest = ctx.store.topics.findByName("REST API design");
  assert.match(rest.plan, /^For the RBC – Backend Intern interview: The JD asks for REST services\.\n• Status codes\n• Pagination$/);
  assert.equal(rest.note_count, 0, "a plan is not a study session");
  assert.deepEqual(
    added.map(({ reminder }) => [reminder.message, reminder.due_at.slice(0, 10)]),
    [
      ["Study REST API design for the RBC interview", "2026-10-30"],
      ["Study sql joins and indexes for the RBC interview", "2026-11-02"],
    ],
  );
  assert.equal(added[0].reminder.application_id, application.id);
  assert.equal(calendar.calls.filter((call) => call.name === "create").length, 1 + 4 + 1 + 2, "follow-up, SQL revisions, the interview, two study reminders");

  assert.equal(ctx.store.applications.get(application.id).interview_on, "2026-11-05");
  const guide = ctx.store.prepGuides.get(application.id);
  assert.deepEqual(guide.topics.map((topic) => topic.added), [true, true, false]);
  await assert.rejects(addPrepTopics(ctx, application.id, { names: ["Kubernetes"] }), /Pick at least one/);
});

test("study days spread before the interview, or one a day when the date is unknown or too close", () => {
  assert.deepEqual(studyDays("2026-10-29", "2026-11-05", 3), ["2026-10-30", "2026-11-01", "2026-11-03"]);
  assert.deepEqual(studyDays("2026-10-29", null, 3), ["2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.deepEqual(studyDays("2026-10-29", "2026-10-30", 2), ["2026-10-30", "2026-10-30"]);
});

test("moving to interview makes the assistant offer a prep guide, and say what is missing", async () => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC" });
  const toolbox = createToolbox(ctx);

  const result = await toolbox.execute({ name: "update_status", args: { application_id: application.id, status: "interview" } });
  assert.equal(result.offer_prep_guide, true);
  assert.equal(result.has_job_description, false);
  assert.equal(result.has_resume, false);

  const again = await toolbox.execute({ name: "update_status", args: { application_id: application.id, status: "offer" } });
  assert.equal(again.offer_prep_guide, undefined);
});

test("from chat: save the JD, make the guide, add the chosen topics", async () => {
  const llm = createFakeLlm({
    jsonResponses: { prep_guide: GUIDE },
    turns: [
      toolTurn(["save_job_description", { application_id: 1, text: "Build REST APIs. SQL." }], ["create_prep_guide", { application_id: 1 }]),
      toolTurn(["add_prep_topics", { application_id: 1, topics: ["REST API design"], interview_on: "2026-11-03" }]),
      { text: "Added REST API design to your study plan.", toolCalls: [] },
    ],
  });
  const ctx = createTestContext({ llm });
  await logApplication(ctx, { company: "RBC" });

  const { actions } = await runChat({ ctx, message: "here's the JD... yes make a guide, add REST", maxTurns: 5 });
  assert.deepEqual(actions.map((action) => action.output.status), ["saved", "created", "added"]);
  assert.deepEqual(actions[1].output.topics.map((topic) => topic.name), ["REST API design", "SQL joins and indexes", "Behavioural: teamwork"]);
  assert.equal(ctx.store.topics.list()[0].name, "REST API design");
});

test("prep guide routes: generate, then add topics", async (t) => {
  const ctx = createTestContext({ llm: createFakeLlm({ jsonResponses: { prep_guide: GUIDE } }) });
  const application = await applicationWithJd(ctx);
  await changeStatus(ctx, application.id, "interview");
  const request = await startServer(t, ctx);

  const created = await request(`/applications/${application.id}/prep-guide`, { method: "POST" });
  assert.equal(created.status, 201);
  assert.equal(created.json.prepGuide.summary, GUIDE.summary);
  assert.equal((await request(`/applications/${application.id}`)).json.prepGuide.topics.length, 3);

  const added = await request(`/applications/${application.id}/prep-guide/topics`, {
    method: "POST",
    body: { topics: ["Behavioural: teamwork"], interview_on: "2026-11-02" },
  });
  assert.equal(added.status, 201);
  assert.equal(added.json.added[0].topic.name, "Behavioural: teamwork");
  assert.match(ctx.store.journal.get("2026-10-29").summary, /Planned interview prep for RBC – Backend Intern/);
  assert.equal((await request(`/applications/${application.id}/prep-guide/topics`, { method: "POST", body: { topics: [] } })).status, 400);
});

test("a new guide remembers what is already in the study plan, and nothing is added twice", async () => {
  const ctx = createTestContext({ llm: createFakeLlm({ jsonResponses: { prep_guide: GUIDE } }) });
  const application = await applicationWithJd(ctx);
  await createPrepGuide(ctx, application.id);
  await addPrepTopics(ctx, application.id, { names: ["REST API design"] });

  const again = await createPrepGuide(ctx, application.id);
  assert.deepEqual(again.topics.map((topic) => topic.added), [true, false, false]);
  await assert.rejects(addPrepTopics(ctx, application.id, { names: ["REST API design"] }), /already in your study plan/);

  const added = await addPrepTopics(ctx, application.id, { names: ["REST API design", "SQL joins and indexes"] });
  assert.deepEqual(added.map(({ topic }) => topic.name), ["SQL joins and indexes"], "only the new one");
  assert.equal(ctx.store.reminders.listPending().filter((r) => r.message.startsWith("Study REST")).length, 1);
});
