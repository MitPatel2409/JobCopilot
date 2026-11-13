const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext } = require("./helpers/testContext");
const { startServer } = require("./helpers/server");
const { makePdf, makeDocx, fileForm } = require("./helpers/fixtures");
const { logApplication } = require("../services/applicationService");
const { fetchJobDescription, isPrivateAddress, visibleText } = require("../services/jobDescriptionService");

const LONG_JD = "We are hiring a Software Developer Intern. ".repeat(10);

test("the job description is saved on the application and no longer missing", async (t) => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC" });
  const request = await startServer(t, ctx);

  const saved = await request(`/applications/${application.id}/jd`, { method: "PUT", body: { text: "Build APIs in Java.\r\nUse SQL." } });
  assert.equal(saved.json.application.jd_text, "Build APIs in Java.\nUse SQL.");
  assert.equal(saved.json.application.jd_saved_at, "2026-10-29T18:00:00.000Z");
  assert.ok(!saved.json.application.missing.includes("jd"));

  const list = await request("/applications");
  assert.equal(list.json.applications[0].has_jd, true);
  assert.equal(list.json.applications[0].jd_text, undefined, "lists leave the text out");

  const cleared = await request(`/applications/${application.id}/jd`, { method: "PUT", body: { text: "" } });
  assert.equal(cleared.json.application.jd_saved_at, null);
});

test("a new application from the form can carry its job description", async (t) => {
  const ctx = createTestContext();
  const request = await startServer(t, ctx);
  const created = await request("/applications", { method: "POST", body: { company: "Shopify", jd_text: "Ruby on Rails, GraphQL" } });
  assert.equal(created.json.application.jd_text, "Ruby on Rails, GraphQL");
});

test("fetching a posting prefers the JobPosting description in the page", async () => {
  const page = `<html><head><title>Job</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},
      {"@type":"JobPosting","title":"Data Analyst","description":"&lt;p&gt;Analyse sales data with SQL &amp;amp; Python.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Build dashboards&lt;/li&gt;&lt;/ul&gt;${"&lt;p&gt;More details.&lt;/p&gt;".repeat(20)}"}]}</script>
    </head><body><nav>Menu</nav><p>Cookie banner</p></body></html>`;
  const fetchImpl = async () => new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
  const lookup = async () => [{ address: "93.184.216.34" }];

  const text = await fetchJobDescription("https://jobs.example.com/1", { fetchImpl, lookup });
  assert.match(text, /^Data Analyst\n\nAnalyse sales data with SQL & Python\.\n\n?• Build dashboards/);
  assert.doesNotMatch(text, /Cookie banner/);
});

test("fetching falls back to the page text, and refuses private addresses at every redirect", async () => {
  const lookup = async (host) => [{ address: host === "internal.example" ? "10.0.0.5" : "93.184.216.34" }];
  const html = `<html><body><script>track()</script><h1>Backend Intern</h1><p>${LONG_JD}</p></body></html>`;
  const page = async () => new Response(html, { headers: { "content-type": "text/html" } });
  assert.match(await fetchJobDescription("https://jobs.example.com/2", { fetchImpl: page, lookup }), /^Backend Intern\nWe are hiring/);

  const redirect = async () => new Response(null, { status: 302, headers: { location: "http://internal.example/admin" } });
  await assert.rejects(fetchJobDescription("https://jobs.example.com/3", { fetchImpl: redirect, lookup }), /private network/);
  await assert.rejects(fetchJobDescription("http://127.0.0.1:5000/today", { fetchImpl: page, lookup }), /private network/);
  await assert.rejects(fetchJobDescription("file:///etc/passwd", { fetchImpl: page, lookup }), /Only http/);

  const empty = async () => new Response("<html><body><div id=root></div></body></html>", { headers: { "content-type": "text/html" } });
  await assert.rejects(fetchJobDescription("https://jobs.example.com/4", { fetchImpl: empty, lookup }), /paste it instead/);
});

test("private address check covers the usual ranges", () => {
  for (const address of ["10.1.2.3", "172.16.0.1", "192.168.1.1", "127.0.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  for (const address of ["8.8.8.8", "172.32.0.1", "2607:f8b0::1"]) assert.equal(isPrivateAddress(address), false, address);
  assert.equal(visibleText("<p>a&nbsp;&amp;&#x41;</p>"), "a &A");
});

test("a tailored résumé (PDF) is saved per application, with its text, and downloads unchanged", async (t) => {
  const ctx = createTestContext();
  const { application } = await logApplication(ctx, { company: "RBC" });
  const request = await startServer(t, ctx);
  const pdf = makePdf(["Mit Patel", "Python, SQL, Docker"]);

  const uploaded = await request(`/applications/${application.id}/resume`, { method: "POST", form: fileForm(pdf, "Mit Resume RBC.pdf", "application/pdf") });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.json.resume.filename, "Mit Resume RBC.pdf");
  assert.equal(uploaded.json.resume.size, pdf.length);
  assert.match(ctx.store.documents.text(application.id), /Python, SQL, Docker/);

  const download = await request(`/applications/${application.id}/resume`);
  assert.equal(download.headers.get("content-type"), "application/pdf");
  assert.match(download.headers.get("content-disposition"), /attachment; filename="Mit Resume RBC.pdf"/);
  assert.deepEqual(download.buffer, pdf);

  const detail = await request(`/applications/${application.id}`);
  assert.equal(detail.json.resume.filename, "Mit Resume RBC.pdf");

  assert.equal((await request(`/applications/${application.id}/resume`, { method: "DELETE" })).status, 204);
  assert.equal((await request(`/applications/${application.id}/resume`)).status, 404);
});

test("the base résumé (DOCX) lives in Settings; other files are refused", async (t) => {
  const ctx = createTestContext();
  const request = await startServer(t, ctx);
  const docx = makeDocx(["Mit Patel", "React, Node.js, Express"]);

  const uploaded = await request("/profile/resume", { method: "POST", form: fileForm(docx, "resume") });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.json.resume.filename, "resume.docx");
  assert.match(ctx.store.documents.text(null), /React, Node\.js, Express/);
  assert.equal((await request("/profile")).json.resume.filename, "resume.docx");

  const exe = await request("/profile/resume", { method: "POST", form: fileForm(Buffer.from("MZ not a resume"), "resume.pdf", "application/pdf") });
  assert.equal(exe.status, 400);
  assert.match(exe.json.error, /Only PDF and Word/);
  const none = await request("/profile/resume", { method: "POST", form: new FormData() });
  assert.equal(none.status, 400);

  const big = Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(5 * 1024 * 1024)]);
  assert.match((await request("/profile/resume", { method: "POST", form: fileForm(big, "big.pdf") })).json.error, /over 5 MB/);
});

test("an application can reuse the résumé of another one, or the base résumé", async (t) => {
  const ctx = createTestContext();
  const { application: first } = await logApplication(ctx, { company: "Qualcomm", role: "ML Internship" });
  const { application: second } = await logApplication(ctx, { company: "Qualcomm", role: "AI Software Systems Co-op" });
  const { application: bare } = await logApplication(ctx, { company: "TD" });
  ctx.store.documents.save(first.id, { filename: "qualcomm.pdf", mime: "application/pdf", content: Buffer.from("%PDF q"), text: "Deep learning" });
  const request = await startServer(t, ctx);

  const copied = await request(`/applications/${second.id}/resume/copy`, { method: "POST", body: { from_application_id: first.id } });
  assert.equal(copied.status, 201);
  assert.equal(copied.json.resume.filename, "qualcomm.pdf");
  assert.equal(ctx.store.documents.text(second.id), "Deep learning");
  assert.equal((await request(`/applications/${second.id}/resume`)).text, "%PDF q");
  assert.equal((await request("/applications")).json.applications.find((a) => a.id === second.id).resume_filename, "qualcomm.pdf");

  assert.equal((await request(`/applications/${second.id}/resume/copy`, { method: "POST", body: { from_application_id: bare.id } })).status, 400);
  assert.equal((await request(`/applications/${second.id}/resume/copy`, { method: "POST", body: { from_application_id: null } })).status, 400, "no base résumé yet");
  ctx.store.documents.save(null, { filename: "base.pdf", mime: "application/pdf", content: Buffer.from("%PDF b"), text: "Base" });
  assert.equal((await request(`/applications/${bare.id}/resume/copy`, { method: "POST", body: { from_application_id: null } })).json.resume.filename, "base.pdf");
});
