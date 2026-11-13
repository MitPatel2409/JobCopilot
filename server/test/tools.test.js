const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext } = require("./helpers/testContext");
const { createFakeLlm } = require("./helpers/fakeLlm");
const { createToolbox } = require("../services/agent/tools");
const { logApplication } = require("../services/applicationService");

const run = (toolbox, name, args) => toolbox.execute({ id: "c", name, args });

test("tool errors come back as results the model can read", async () => {
  const toolbox = createToolbox(createTestContext());

  assert.deepEqual(await run(toolbox, "log_application", {}), { status: "error", message: "company is required." });
  assert.match((await run(toolbox, "log_application", { company: "RBC", applied_on: "yesterday" })).message, /applied_on must be a date/);
  assert.match((await run(toolbox, "update_status", { application_id: 99, status: "oa" })).message, /does not exist/);
  assert.match((await run(toolbox, "nope", {})).message, /Unknown tool/);
});

test("log_application returns what is missing and the follow-up date", async () => {
  const toolbox = createToolbox(createTestContext());
  const result = await run(toolbox, "log_application", { company: "RBC", role: "Amplify Intern" });

  assert.equal(result.status, "saved");
  assert.deepEqual(result.application.missing, ["url", "contact", "jd"]);
  assert.match(result.follow_up.due, /Nov 5/);
});

test("add_contact cleans up the LinkedIn URL and email", async () => {
  const ctx = createTestContext();
  const toolbox = createToolbox(ctx);
  const { application } = await run(toolbox, "log_application", { company: "RBC" });

  const result = await run(toolbox, "add_contact", {
    application_id: application.id,
    name: "Priya Shah",
    linkedin_url: "linkedin.com/in/priyashah",
    email: "Priya.Shah@RBC.com",
  });
  assert.equal(result.contact.linkedin_url, "https://linkedin.com/in/priyashah");
  assert.equal(result.contact.email, "priya.shah@rbc.com");
  assert.deepEqual(ctx.store.applications.get(application.id).missing, ["url", "jd"]);

  const bad = await run(toolbox, "add_contact", { application_id: application.id, name: "X", email: "not-an-email" });
  assert.match(bad.message, /email must be an email address/);
});

test("draft_outreach saves an unsent draft and gives the model only the facts", async () => {
  const llm = createFakeLlm({
    jsonResponses: { draft_outreach: { subject: "RBC Amplify application", body: "Hi Priya, ..." } },
  });
  const ctx = createTestContext({ llm, config: { userPitch: "Data engineering student at Seneca" } });
  const toolbox = createToolbox(ctx);
  const { application } = await run(toolbox, "log_application", { company: "RBC", role: "Amplify Intern" });
  const { contact } = await run(toolbox, "add_contact", { application_id: application.id, name: "Priya", email: "p@rbc.com" });

  const result = await run(toolbox, "draft_outreach", {
    application_id: application.id,
    contact_id: contact.id,
    intent: "just applied, ask for a quick chat",
  });

  assert.equal(result.status, "drafted_not_sent");
  assert.equal(result.outreach.to, "p@rbc.com");
  const [saved] = ctx.store.outreach.listByApplication(application.id);
  assert.equal(saved.status, "draft");
  assert.equal(saved.channel, "email");
  assert.equal(saved.contact_name, "Priya");

  const prompt = llm.jsonCalls[0].prompt;
  assert.match(prompt, /Amplify Intern at RBC/);
  assert.match(prompt, /Data engineering student at Seneca/);
  assert.match(prompt, /Sender: Mit/);
});

test("save_outreach marks a draft as sent", async () => {
  const ctx = createTestContext({
    llm: createFakeLlm({ jsonResponses: { draft_outreach: { subject: "s", body: "b" } } }),
  });
  const toolbox = createToolbox(ctx);
  const { application } = await run(toolbox, "log_application", { company: "RBC" });
  const { outreach } = await run(toolbox, "draft_outreach", { application_id: application.id, intent: "intro" });

  const result = await run(toolbox, "save_outreach", { outreach_id: outreach.id, sent: true });
  assert.equal(result.status, "marked_sent");
  assert.equal(ctx.store.outreach.get(outreach.id).sent_on, "2026-10-29");
});

test("add_reminder reads local times and refuses the past", async () => {
  const ctx = createTestContext();
  const toolbox = createToolbox(ctx);

  const result = await run(toolbox, "add_reminder", { message: "Send thank-you note", due: "2026-10-30T17:00" });
  assert.equal(result.status, "saved");
  assert.equal(ctx.store.reminders.get(result.reminder.id).due_at, "2026-10-30T21:00:00.000Z");

  assert.match((await run(toolbox, "add_reminder", { message: "x", due: "2026-10-01" })).message, /in the past/);
});

test("list_due and snooze_reminder", async () => {
  const ctx = createTestContext();
  const toolbox = createToolbox(ctx);
  await run(toolbox, "log_study", { topic: "Docker" }); // revisions from tomorrow
  await run(toolbox, "log_application", { company: "RBC" }); // follow-up in 7 days

  assert.equal((await run(toolbox, "list_due", { range: "today" })).count, 0);
  const week = await run(toolbox, "list_due", { range: "week" });
  assert.equal(week.count, 4); // 3 revisions + the follow-up on Nov 5

  const first = week.reminders[0];
  const snoozed = await run(toolbox, "snooze_reminder", { reminder_id: first.id, until: "2026-11-02" });
  assert.equal(snoozed.status, "snoozed");
  assert.equal(ctx.store.reminders.get(first.id).due_at, "2026-11-02T14:00:00.000Z");
});

test("log_journal builds up one entry per day", async () => {
  const ctx = createTestContext();
  const toolbox = createToolbox(ctx);
  await run(toolbox, "log_journal", { summary: "Applied to RBC Amplify" });
  const result = await run(toolbox, "log_journal", { summary: "Studied Docker" });
  assert.equal(result.journal, "Applied to RBC Amplify\nStudied Docker");
});

test("use_resume attaches the résumé of the application the user names", async () => {
  const ctx = createTestContext();
  const { application: first } = await logApplication(ctx, { company: "Qualcomm", role: "ML Internship" });
  const { application: second } = await logApplication(ctx, { company: "Qualcomm", role: "AI Software Systems Co-op" });
  ctx.store.documents.save(first.id, { filename: "qualcomm.pdf", mime: "application/pdf", content: Buffer.from("%PDF"), text: "x" });
  const toolbox = createToolbox(ctx);

  const result = await toolbox.execute({ name: "use_resume", args: { application_id: second.id, from_application_id: first.id } });
  assert.deepEqual(result, { status: "attached", application_id: second.id, resume: "qualcomm.pdf" });
  const found = await toolbox.execute({ name: "find_applications", args: { query: "qualcomm" } });
  assert.ok(found.applications.every((a) => a.resume === "qualcomm.pdf"));
});

test("update_application sets the interview date, which adds the interview reminder", async () => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC", role: "Amplify" });
  const toolbox = createToolbox(ctx);

  const result = await toolbox.execute({ name: "update_application", args: { application_id: application.id, interview_on: "2026-11-19" } });
  assert.equal(result.application.interview_on, "2026-11-19");
  assert.equal(ctx.store.reminders.pendingTagged(application.id, "interview")[0].message, "Interview: RBC – Amplify");
});

test("edit_reminder and delete_reminder", async () => {
  const ctx = createTestContext();
  const toolbox = createToolbox(ctx);
  const added = await toolbox.execute({ name: "add_reminder", args: { message: "Send thanks", due: "2026-10-30" } });

  const edited = await toolbox.execute({ name: "edit_reminder", args: { reminder_id: added.reminder.id, message: "Send thank-you note", due: "2026-10-31T15:00" } });
  assert.equal(edited.reminder.message, "Send thank-you note");
  assert.match(edited.reminder.due, /Oct 31/);
  assert.equal((await toolbox.execute({ name: "edit_reminder", args: { reminder_id: added.reminder.id, due: "2026-10-01" } })).status, "error");

  assert.equal((await toolbox.execute({ name: "delete_reminder", args: { reminder_id: added.reminder.id } })).status, "deleted");
  assert.equal(ctx.store.reminders.get(added.reminder.id), null);
});

test("update_contact and delete_contact", async () => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "Labatt" });
  const contact = ctx.store.contacts.create({ applicationId: application.id, name: "Yeena", email: "yeena@labat.com" });
  const toolbox = createToolbox(ctx);

  const fixed = await toolbox.execute({ name: "update_contact", args: { contact_id: contact.id, name: "Yeena Kim", email: "yeena.kim@labatt.com" } });
  assert.equal(fixed.contact.email, "yeena.kim@labatt.com");
  assert.equal(fixed.contact.name, "Yeena Kim");
  assert.equal((await toolbox.execute({ name: "delete_contact", args: { contact_id: contact.id } })).status, "deleted");
  assert.equal(ctx.store.contacts.get(contact.id), null);
});

test("log_application can take the job description and reuse another application's résumé", async () => {
  const ctx = createTestContext();
  const { application: first } = await logApplication(ctx, { company: "Qualcomm", role: "ML Internship" });
  ctx.store.documents.save(first.id, { filename: "qualcomm.pdf", mime: "application/pdf", content: Buffer.from("%PDF"), text: "x" });
  const toolbox = createToolbox(ctx);

  const result = await toolbox.execute({
    name: "log_application",
    args: { company: "Qualcomm", role: "AI Systems Co-op", job_description: "Build ML systems.", resume_from_application_id: first.id },
  });
  assert.equal(result.status, "saved");
  assert.equal(result.resume, "qualcomm.pdf");
  assert.ok(!result.application.missing.includes("jd"));
  assert.equal(ctx.store.applications.get(result.application.id).jd_text, "Build ML systems.");
});
