const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext, createFakeCalendar, createFakeGmail } = require("./helpers/testContext");
const { startServer } = require("./helpers/server");
const { logApplication } = require("../services/applicationService");
const { logStudy } = require("../services/studyService");

test("contacts: add, edit, clear a field, delete", async (t) => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC" });
  const request = await startServer(t, ctx);

  const created = await request(`/applications/${application.id}/contacts`, {
    method: "POST",
    body: { name: "Yeena Kim", title: "Recruiter", email: "Yeena@RBC.com", linkedin_url: "linkedin.com/in/yeena" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.contact.email, "yeena@rbc.com");
  assert.equal(created.json.contact.linkedin_url, "https://linkedin.com/in/yeena");
  assert.deepEqual(ctx.store.applications.get(application.id).missing, ["url", "jd"], "a recruiter is no longer missing");

  const id = created.json.contact.id;
  const edited = await request(`/contacts/${id}`, { method: "PATCH", body: { title: "", email: "yeena.kim@rbc.com" } });
  assert.equal(edited.json.contact.title, "");
  assert.equal(edited.json.contact.email, "yeena.kim@rbc.com");
  assert.equal((await request(`/contacts/${id}`, { method: "PATCH", body: { email: "not an email" } })).status, 400);

  assert.equal((await request(`/contacts/${id}`, { method: "DELETE" })).status, 204);
  assert.equal(ctx.store.contacts.get(id), null);
});

test("messages: write your own, edit, mark sent, delete", async (t) => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC" });
  const contact = ctx.store.contacts.create({ applicationId: application.id, name: "Yeena", email: "yeena@rbc.com" });
  const request = await startServer(t, ctx);

  const created = await request(`/applications/${application.id}/outreach`, {
    method: "POST",
    body: { contact_id: contact.id, subject: "Hello", body: "Hi Yeena, ..." },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.outreach.status, "draft");
  assert.equal(created.json.outreach.contact_email, "yeena@rbc.com");

  const id = created.json.outreach.id;
  const sent = await request(`/outreach/${id}`, { method: "PATCH", body: { body: "Hi Yeena!", status: "sent" } });
  assert.equal(sent.json.outreach.status, "sent");
  assert.equal(sent.json.outreach.sent_on, "2026-10-29");

  const alreadySent = await request(`/applications/${application.id}/outreach`, {
    method: "POST",
    body: { channel: "linkedin", body: "Connected!", status: "sent", sent_on: "2026-10-27" },
  });
  assert.equal(alreadySent.json.outreach.sent_on, "2026-10-27");
  assert.equal((await request(`/applications/${application.id}/outreach`, { method: "POST", body: { subject: "x" } })).status, 400);

  assert.equal((await request(`/outreach/${id}`, { method: "DELETE" })).status, 204);
  assert.equal(ctx.store.outreach.listByApplication(application.id).length, 1);
});

test("a draft can be copied to Gmail Drafts once that service is connected; it is never sent", async (t) => {
  const gmail = createFakeGmail();
  const ctx = createTestContext({ gmail });
  const { application } = await logApplication(ctx, { company: "RBC" });
  const contact = ctx.store.contacts.create({ applicationId: application.id, name: "Yeena", email: "yeena@rbc.com" });
  const draft = ctx.store.outreach.create({ applicationId: application.id, contactId: contact.id, subject: "Following up", body: "Hi" });
  const request = await startServer(t, ctx);

  const saved = await request(`/outreach/${draft.id}/gmail-draft`, { method: "POST" });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.outreach.gmail_draft_id, "draft-1");
  assert.equal(saved.json.outreach.status, "draft");
  assert.deepEqual(gmail.drafts, [{ to: "yeena@rbc.com", subject: "Following up", text: "Hi" }]);

  const off = createTestContext();
  const { application: other } = await logApplication(off, { company: "TD" });
  const offDraft = off.store.outreach.create({ applicationId: other.id, body: "Hi" });
  const offRequest = await startServer(t, off);
  const refused = await offRequest(`/outreach/${offDraft.id}/gmail-draft`, { method: "POST" });
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /Settings/);
});

test("status changes from the form keep a note in the history", async (t) => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC" });
  const request = await startServer(t, ctx);

  await request(`/applications/${application.id}`, { method: "PATCH", body: { status: "interview", note: "Technical round Nov 3", interview_on: "2026-11-03" } });
  const detail = await request(`/applications/${application.id}`);
  assert.equal(detail.json.statusEvents.at(-1).note, "Technical round Nov 3");
  assert.equal(detail.json.application.interview_on, "2026-11-03");
});

test("reminders: edit the text and time (the calendar follows), then delete", async (t) => {
  const calendar = createFakeCalendar();
  const ctx = createTestContext({ calendar });
  const request = await startServer(t, ctx);

  const created = await request("/reminders", { method: "POST", body: { message: "Send thank-you note", due: "2026-10-30T17:00" } });
  const id = created.json.reminder.id;

  const edited = await request(`/reminders/${id}`, { method: "PATCH", body: { message: "Send thank-you notes", due: "2026-10-31T10:00" } });
  assert.equal(edited.json.reminder.message, "Send thank-you notes");
  assert.equal(edited.json.reminder.due_at, "2026-10-31T14:00:00.000Z");
  assert.equal(calendar.calls.at(-1).name, "update");
  assert.equal(calendar.calls.at(-1).event.summary, "Send thank-you notes");

  assert.equal((await request(`/reminders/${id}`, { method: "PATCH", body: { due: "2026-10-01" } })).status, 400);
  assert.equal((await request(`/reminders/${id}`, { method: "DELETE" })).status, 204);
  assert.equal(calendar.calls.at(-1).name, "delete");
  assert.equal(ctx.store.reminders.get(id), null);
});

test("journal: add a line to today, rewrite a day, clear it", async (t) => {
  const ctx = createTestContext();
  const request = await startServer(t, ctx);

  await request("/journal", { method: "POST", body: { line: "Mock interview with Sam" } });
  await request("/journal", { method: "POST", body: { line: "Read the RBC JD" } });
  assert.equal(ctx.store.journal.get("2026-10-29").summary, "Mock interview with Sam\nRead the RBC JD");

  const rewritten = await request("/journal/2026-10-28", { method: "PUT", body: { summary: "  Applied to TD \n\n Studied SQL " } });
  assert.equal(rewritten.json.entry.summary, "Applied to TD\nStudied SQL");

  await request("/journal/2026-10-28", { method: "PUT", body: { summary: "" } });
  assert.equal(ctx.store.journal.get("2026-10-28"), null);
  assert.equal((await request("/journal", { method: "POST", body: {} })).status, 400);
});

test("study: rename a topic, set its plan, edit and delete notes, delete the topic and its revisions", async (t) => {
  const calendar = createFakeCalendar();
  const ctx = createTestContext({ calendar });
  const { topic } = await logStudy(ctx, { topic: "Docker", note: "Volumes" });
  await logStudy(ctx, { topic: "SQL" });
  const request = await startServer(t, ctx);

  const renamed = await request(`/topics/${topic.id}`, { method: "PATCH", body: { name: "Docker basics", plan: "Compose, networking" } });
  assert.equal(renamed.json.topic.name, "Docker basics");
  assert.equal(renamed.json.topic.plan, "Compose, networking");
  assert.equal((await request(`/topics/${topic.id}`, { method: "PATCH", body: { name: "sql" } })).status, 400, "name already used");

  const [note] = ctx.store.topics.notes(topic.id);
  const edited = await request(`/topics/${topic.id}/notes/${note.id}`, { method: "PATCH", body: { body: "Volumes vs bind mounts" } });
  assert.equal(edited.json.note.body, "Volumes vs bind mounts");
  assert.equal((await request(`/topics/${topic.id}/notes/${note.id}`, { method: "DELETE" })).status, 204);
  assert.equal(ctx.store.topics.notes(topic.id).length, 0);

  const deletesBefore = calendar.calls.filter((call) => call.name === "delete").length;
  assert.equal((await request(`/topics/${topic.id}`, { method: "DELETE" })).status, 204);
  assert.equal(ctx.store.topics.get(topic.id), null);
  assert.equal(calendar.calls.filter((call) => call.name === "delete").length - deletesBefore, 4, "its 4 revisions left the calendar");
  assert.equal(ctx.store.reminders.listByTopic(topic.id).length, 0);
});

test("settings: name, timezone and hours override the defaults; null goes back to the default", async (t) => {
  const ctx = createTestContext();
  const request = await startServer(t, ctx);

  const saved = await request("/profile", {
    method: "PATCH",
    body: { name: "Mit P", pitch: "Final-year CS student", timezone: "America/Vancouver", reminder_hour: 8, digest_enabled: false },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.settings.timezone, "America/Vancouver");
  assert.equal(saved.json.settings.digest_enabled, false);

  const user = ctx.app.users.get(ctx.user.id);
  const scoped = ctx.app.forUser(user);
  assert.equal(scoped.config.userName, "Mit P");
  assert.equal(scoped.config.reminderHour, 8);
  assert.equal(scoped.today(), "2026-10-29");

  const reset = await request("/profile", { method: "PATCH", body: { timezone: null } });
  assert.equal(reset.json.settings.timezone, null);
  assert.equal(reset.json.defaults.timezone, "America/Toronto");
  assert.equal((await request("/profile", { method: "PATCH", body: { timezone: "Mars/Olympus" } })).status, 400);
  assert.equal((await request("/profile", { method: "PATCH", body: { nudge_hour: 25 } })).status, 400);
});
