const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createTestContext } = require("./helpers/testContext");
const { makePdf, makeDocx } = require("./helpers/fixtures");
const { logApplication } = require("../services/applicationService");
const { scan, inbox, attach, ignore, ignoreAll, undo, status } = require("../services/resumeFolderService");
const { createCheckResumeFolderTool } = require("../services/agent/tools/checkResumeFolder");

/** A context watching a fresh temp folder. Files are old enough to count as finished. */
function setup({ autoAttach = false, folder = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jc-resumes-"));
  const ctx = createTestContext({ config: { resumeFolder: folder ? dir : "" } });
  ctx.config.resumeAutoAttach = autoAttach;
  if (folder) ctx.store.meta.set("resume_baseline", path.resolve(dir)); // as if the folder was already looked at once
  const put = (name, buffer) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, buffer);
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(file, past, past);
  };
  return { ctx, dir, put, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const NOW = { settleMs: 0 };

async function apply(ctx, company, role = "", appliedOn = "2026-10-29") {
  return (await logApplication(ctx, { company, role, appliedOn })).application;
}

test("a new file shows up in the inbox with the application it names as the best guess", async () => {
  const { ctx, put, cleanup } = setup();
  try {
    const shopify = await apply(ctx, "Shopify", "Backend Intern");
    await apply(ctx, "RBC", "Amplify");
    put("Mit_Shopify_Backend.pdf", makePdf(["Backend developer"]));

    const result = await scan(ctx, NOW);
    assert.equal(result.added, 1);
    assert.equal(result.found, 1);

    const [file] = inbox(ctx);
    assert.equal(file.filename, "Mit_Shopify_Backend.pdf");
    assert.equal(file.guesses[0].application_id, shopify.id);
    assert.equal(file.guesses.length, 1);
    assert.equal(file.suggested_name, "Shopify Backend");
    assert.ok(ctx.published.some((event) => event.type === "resume_inbox"));
  } finally {
    cleanup();
  }
});

test("the same file is not offered twice, and a saved-again file with the same content is not new", async () => {
  const { ctx, dir, put, cleanup } = setup();
  try {
    await apply(ctx, "Shopify");
    put("Shopify.pdf", makePdf(["a"]));
    await scan(ctx, NOW);
    assert.equal((await scan(ctx, NOW)).added, 0);

    const file = path.join(dir, "Shopify.pdf");
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(file, later, later); // saved again, nothing changed
    assert.equal((await scan(ctx, NOW)).added, 0);
    assert.equal(inbox(ctx).length, 1);
  } finally {
    cleanup();
  }
});

test("changed content replaces the waiting entry", async () => {
  const { ctx, put, cleanup } = setup();
  try {
    await apply(ctx, "Shopify");
    put("Shopify.pdf", makePdf(["first"]));
    await scan(ctx, NOW);
    put("Shopify.pdf", makePdf(["second version"]));

    assert.equal((await scan(ctx, NOW)).added, 1);
    assert.equal(inbox(ctx).length, 1);
  } finally {
    cleanup();
  }
});

test("a renamed file with the same content is not offered again", async () => {
  const { ctx, dir, put, cleanup } = setup();
  try {
    await apply(ctx, "Shopify");
    put("Shopify.pdf", makePdf(["a"]));
    await scan(ctx, NOW);
    fs.renameSync(path.join(dir, "Shopify.pdf"), path.join(dir, "Shopify final.pdf"));

    assert.equal((await scan(ctx, NOW)).added, 0);
    const [file] = inbox(ctx);
    assert.equal(file.filename, "Shopify final.pdf");
  } finally {
    cleanup();
  }
});

test("a file that is removed from the folder leaves the inbox", async () => {
  const { ctx, dir, put, cleanup } = setup();
  try {
    put("Shopify.pdf", makePdf(["a"]));
    await scan(ctx, NOW);
    fs.rmSync(path.join(dir, "Shopify.pdf"));
    await scan(ctx, NOW);
    assert.deepEqual(inbox(ctx), []);
  } finally {
    cleanup();
  }
});

test("a file with no matching company waits with no guesses", async () => {
  const { ctx, put, cleanup } = setup();
  try {
    await apply(ctx, "Shopify");
    put("resume_final_v2.docx", makeDocx(["Mit Patel"]));
    await scan(ctx, NOW);
    assert.deepEqual(inbox(ctx)[0].guesses, []);
  } finally {
    cleanup();
  }
});

test("lock files, other types, sub-folders, empty and unfinished files are skipped", async () => {
  const { ctx, dir, put, cleanup } = setup();
  try {
    put("~$Shopify.docx", makeDocx(["lock"]));
    put("notes.txt", "hello");
    put("empty.pdf", Buffer.alloc(0));
    fs.mkdirSync(path.join(dir, "old.pdf")); // a folder named like a file
    put("Fresh.pdf", makePdf(["just saved"]));

    const result = await scan(ctx, { settleMs: 3_600_000 }); // everything counts as just saved
    assert.equal(result.added, 0);
    assert.equal(result.found, 2); // Fresh.pdf and empty.pdf; the lock file, .txt and folder are not candidates
    assert.deepEqual(inbox(ctx), []);
  } finally {
    cleanup();
  }
});

test("two close matches are never attached on their own, even with automatic attach on", async () => {
  const { ctx, put, cleanup } = setup({ autoAttach: true });
  try {
    await apply(ctx, "Shopify", "Backend Intern");
    await apply(ctx, "Shopify", "Data Intern");
    put("Shopify.pdf", makePdf(["x"]));

    const result = await scan(ctx, NOW);
    assert.deepEqual(result.attached, []);
    assert.equal(inbox(ctx).length, 1);
    assert.equal(inbox(ctx)[0].sure, false);
  } finally {
    cleanup();
  }
});

test("with automatic attach off, even a clear match waits for the user", async () => {
  const { ctx, put, cleanup } = setup({ autoAttach: false });
  try {
    const shopify = await apply(ctx, "Shopify", "Backend Intern");
    put("Shopify_Backend_Intern.pdf", makePdf(["x"]));

    await scan(ctx, NOW);
    assert.equal(inbox(ctx)[0].sure, true);
    assert.equal(ctx.store.documents.info(shopify.id), null);
  } finally {
    cleanup();
  }
});

test("with automatic attach on, one clear match is attached, announced, and can be undone", async () => {
  const { ctx, put, cleanup } = setup({ autoAttach: true });
  try {
    const shopify = await apply(ctx, "Shopify", "Backend Intern");
    await apply(ctx, "RBC", "Amplify");
    put("Shopify_Backend_Intern.pdf", makePdf(["Backend developer"]));

    const result = await scan(ctx, NOW);
    assert.equal(result.attached.length, 1);
    assert.equal(ctx.store.documents.info(shopify.id).filename, "Shopify_Backend_Intern.pdf");
    assert.deepEqual(inbox(ctx), []);
    const event = ctx.published.find((item) => item.type === "resume_attached");
    assert.equal(event.application_id, shopify.id);

    undo(ctx, event.file_id);
    assert.equal(ctx.store.documents.info(shopify.id), null);
    assert.equal(inbox(ctx).length, 1);

    await scan(ctx, NOW); // undone once: not attached on its own again
    assert.equal(ctx.store.documents.info(shopify.id), null);
  } finally {
    cleanup();
  }
});

test("automatic attach leaves an application that already has a résumé alone", async () => {
  const { ctx, put, cleanup } = setup({ autoAttach: true });
  try {
    const shopify = await apply(ctx, "Shopify", "Backend Intern");
    ctx.store.documents.save(shopify.id, { filename: "mine.pdf", mime: "application/pdf", content: Buffer.from("%PDF old"), text: "old" });
    put("Shopify_Backend_Intern.pdf", makePdf(["new"]));

    await scan(ctx, NOW);
    assert.equal(ctx.store.documents.info(shopify.id).filename, "mine.pdf");
    const [file] = inbox(ctx);
    assert.equal(file.guesses[0].resume_filename, "mine.pdf"); // the page offers "Replace"
  } finally {
    cleanup();
  }
});

test("a file already uploaded by hand is recognised and not offered", async () => {
  const { ctx, put, cleanup } = setup();
  try {
    const shopify = await apply(ctx, "Shopify");
    const pdf = makePdf(["Backend developer"]);
    ctx.store.documents.save(shopify.id, { filename: "Shopify.pdf", mime: "application/pdf", content: pdf, text: "Backend developer" });
    put("Shopify.pdf", pdf);

    const result = await scan(ctx, NOW);
    assert.equal(result.added, 0);
    assert.deepEqual(inbox(ctx), []);
  } finally {
    cleanup();
  }
});

test("attaching uses the same saving as an upload and replaces an existing résumé", async () => {
  const { ctx, put, cleanup } = setup();
  try {
    const shopify = await apply(ctx, "Shopify");
    ctx.store.documents.save(shopify.id, { filename: "old.pdf", mime: "application/pdf", content: Buffer.from("%PDF old"), text: "old" });
    put("Shopify.pdf", makePdf(["Kubernetes and Go"]));
    await scan(ctx, NOW);

    const [file] = inbox(ctx);
    const { resume } = await attach(ctx, file.id, shopify.id);
    assert.equal(resume.filename, "Shopify.pdf");
    assert.match(ctx.store.documents.text(shopify.id), /Kubernetes and Go/);
    assert.deepEqual(inbox(ctx), []);
  } finally {
    cleanup();
  }
});

test("attaching refuses a file that changed since it was found", async () => {
  const { ctx, put, cleanup } = setup();
  try {
    const shopify = await apply(ctx, "Shopify");
    put("Shopify.pdf", makePdf(["one"]));
    await scan(ctx, NOW);
    put("Shopify.pdf", makePdf(["two"]));

    await assert.rejects(() => attach(ctx, inbox(ctx)[0].id, shopify.id), /changed/);
    assert.equal(ctx.store.documents.info(shopify.id), null);
  } finally {
    cleanup();
  }
});

test("attaching refuses a file that is gone or not in the folder", async () => {
  const { ctx, dir, put, cleanup } = setup();
  try {
    const shopify = await apply(ctx, "Shopify");
    put("Shopify.pdf", makePdf(["one"]));
    await scan(ctx, NOW);
    const [file] = inbox(ctx);

    fs.rmSync(path.join(dir, "Shopify.pdf"));
    await assert.rejects(() => attach(ctx, file.id, shopify.id), /gone/);

    // A row pointing outside the folder (for example after the folder was changed) is refused too.
    const outside = ctx.store.resumeFiles.create({
      path: path.join(os.tmpdir(), "elsewhere.pdf"),
      filename: "elsewhere.pdf",
      size: 1,
      mtimeMs: 1,
      sha256: "x",
      text: "",
    });
    await assert.rejects(() => attach(ctx, outside.id, shopify.id), /not in your résumé folder/);
  } finally {
    cleanup();
  }
});

test("ignore and ignore-all take files out of the inbox for good", async () => {
  const { ctx, put, cleanup } = setup();
  try {
    put("A.pdf", makePdf(["a"]));
    put("B.pdf", makePdf(["b"]));
    put("C.pdf", makePdf(["c"]));
    await scan(ctx, NOW);
    assert.equal(inbox(ctx).length, 3);

    ignore(ctx, inbox(ctx)[0].id);
    assert.equal(inbox(ctx).length, 2);
    assert.equal(ignoreAll(ctx), 2);

    assert.equal((await scan(ctx, NOW)).added, 0);
    assert.deepEqual(inbox(ctx), []);
  } finally {
    cleanup();
  }
});

test("a missing folder is reported, not thrown, and the inbox is kept", async () => {
  const { ctx, dir, put, cleanup } = setup();
  try {
    put("Shopify.pdf", makePdf(["a"]));
    await scan(ctx, NOW);
    fs.rmSync(dir, { recursive: true, force: true });

    const result = await scan(ctx, NOW);
    assert.match(result.error, /Can't read the résumé folder/);
    assert.equal(inbox(ctx).length, 1);
    assert.match(status(ctx).last_scan.error, /Can't read/);
  } finally {
    cleanup();
  }
});

test("without a folder nothing is scanned and waiting files are cleared", async () => {
  const { ctx, put, cleanup } = setup({ folder: false });
  try {
    put("Shopify.pdf", makePdf(["a"]));
    const result = await scan(ctx, NOW);
    assert.equal(result.configured, false);
    assert.deepEqual(inbox(ctx), []);
    assert.equal(status(ctx).last_scan, null);
  } finally {
    cleanup();
  }
});

test("a file that is not really a PDF or Word file is ignored quietly", async () => {
  const { ctx, put, cleanup } = setup();
  try {
    put("Shopify.pdf", "this is plain text");
    assert.equal((await scan(ctx, NOW)).added, 0);
    assert.deepEqual(inbox(ctx), []);
  } finally {
    cleanup();
  }
});

test("the chat tool reports what was found and what waits", async () => {
  const { ctx, put, cleanup } = setup();
  try {
    await apply(ctx, "Shopify", "Backend Intern");
    put("Shopify.pdf", makePdf(["a"]));

    const result = await createCheckResumeFolderTool(ctx).execute({});
    assert.equal(result.status, "checked");
    assert.equal(result.waiting_on_today_page[0].best_guess, "Shopify Backend Intern");
  } finally {
    cleanup();
  }
});

test("the folder is a setting; the inbox and its buttons work over HTTP", async (t) => {
  const { startServer } = require("./helpers/server");
  const { ctx, dir, put, cleanup } = setup({ folder: false });
  t.after(cleanup);
  const shopify = await apply(ctx, "Shopify", "Backend Intern");
  const request = await startServer(t, ctx);

  const missing = await request("/profile", { method: "PATCH", body: { resume_folder: path.join(dir, "nope") } });
  assert.equal(missing.status, 400);

  const saved = await request("/profile", { method: "PATCH", body: { resume_folder: dir, resume_auto_attach: false } });
  assert.equal(saved.json.settings.resume_folder, path.resolve(dir));
  ctx.store.meta.set("resume_baseline", path.resolve(dir));

  put("Shopify_Backend_Intern.pdf", makePdf(["Express and SQL"]));
  const checked = await request("/resume-inbox/scan", { method: "POST" });
  assert.equal(checked.status, 200);
  assert.equal(checked.json.last_scan.error, null);
  assert.equal(checked.json.files.length, 1);
  const [file] = checked.json.files;
  assert.equal(file.guesses[0].application_id, shopify.id);

  const today = await request("/today");
  assert.equal(today.json.resumeFiles.length, 1);

  const attached = await request(`/resume-inbox/${file.id}/attach`, { method: "POST", body: { application_id: shopify.id } });
  assert.equal(attached.status, 200);
  assert.equal(attached.json.files.length, 0);
  assert.equal((await request(`/applications/${shopify.id}`)).json.resume.filename, "Shopify_Backend_Intern.pdf");

  const cleared = await request("/profile", { method: "PATCH", body: { resume_folder: "" } });
  assert.equal(cleared.json.settings.resume_folder, null);
  assert.equal((await request("/resume-inbox")).json.folder, "");
});

/** The user's real layout: one sub-folder per company, generic file names inside. */
test("a company sub-folder names the company; cover letters and transcripts are not résumés", async () => {
  const { ctx, dir, put, cleanup } = setup();
  try {
    const rbc = await apply(ctx, "RBC", "Amplify");
    const shopify = await apply(ctx, "Shopify", "Data Engineering Intern");
    fs.mkdirSync(path.join(dir, "RBC"));
    fs.mkdirSync(path.join(dir, "ShopiFy"));
    put("RBC/Resume_Amplify_Oct.pdf", makePdf(["Amplify"]));
    put("RBC/Cover_Letter.pdf", makePdf(["Dear RBC"]));
    put("ShopiFy/Mit_Patel_Cover_Letter.pdf", makePdf(["Dear Shopify"]));
    put("ShopiFy/Resume.pdf", makePdf(["Data"]));
    put("Transcript.pdf", makePdf(["Grades"]));
    put("ShopiFy/Resume_Transcript_merged.pdf", makePdf(["Data and grades"]));

    const result = await scan(ctx, NOW);
    assert.equal(result.found, 3, "two résumés and one merged résumé-and-transcript");
    const byName = Object.fromEntries(inbox(ctx).map((file) => [file.filename, file]));
    assert.equal(byName["Resume_Amplify_Oct.pdf"].guesses[0].application_id, rbc.id);
    assert.equal(byName["Resume.pdf"].guesses[0].application_id, shopify.id);
    assert.equal(byName["Resume.pdf"].guesses.length, 1);

    const { resume } = await attach(ctx, byName["Resume.pdf"].id, shopify.id);
    assert.equal(resume.filename, "Resume.pdf");
  } finally {
    cleanup();
  }
});

test("two files named Resume.pdf in different folders are two different files", async () => {
  const { ctx, dir, put, cleanup } = setup();
  try {
    fs.mkdirSync(path.join(dir, "RBC"));
    fs.mkdirSync(path.join(dir, "TD"));
    put("RBC/Resume.pdf", makePdf(["rbc"]));
    put("TD/Resume.pdf", makePdf(["td"]));
    assert.equal((await scan(ctx, NOW)).added, 2);
  } finally {
    cleanup();
  }
});

test("the first look at a folder only notes what is there; later files are offered", async () => {
  const { ctx, dir, put, cleanup } = setup();
  try {
    ctx.store.meta.set("resume_baseline", ""); // a folder not looked at yet
    await apply(ctx, "RBC");
    fs.mkdirSync(path.join(dir, "RBC"));
    put("RBC/Resume.pdf", makePdf(["old"]));

    const first = await scan(ctx, NOW);
    assert.equal(first.added, 0);
    assert.deepEqual(inbox(ctx), []);
    assert.equal(ctx.published.length, 0, "nothing to announce");

    put("RBC/Resume_New.pdf", makePdf(["new"]));
    assert.equal((await scan(ctx, NOW)).added, 1);
    assert.equal(inbox(ctx)[0].filename, "Resume_New.pdf");
  } finally {
    cleanup();
  }
});

test("a file two folders deep is not read", async () => {
  const { ctx, dir, put, cleanup } = setup();
  try {
    fs.mkdirSync(path.join(dir, "RBC", "old"), { recursive: true });
    put("RBC/old/Resume.pdf", makePdf(["deep"]));
    assert.equal((await scan(ctx, NOW)).found, 0);
  } finally {
    cleanup();
  }
});
