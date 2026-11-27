/**
 * The résumé folder watcher. The user saves each tailored résumé in one
 * folder, either directly in it or in one sub-folder per company ("Shopify/Resume.pdf");
 * this notices new and changed .pdf/.docx files there and gets them onto the
 * right application. Cover letters and transcripts are not résumés and are left alone.
 * The files already there when a folder is first set are noted, not offered.
 *
 *   scan()         lists the folder (read-only), remembers each file by content,
 *                  and, when "attach automatically" is on, attaches a file that
 *                  clearly belongs to one application.
 *   inbox()        the files still waiting, each with its best guesses.
 *   attach()       puts a file on an application through saveResume.
 *   ignore()/undo()
 *
 * Matching is plain rules on the file name (company, role words) and the
 * file's date; the LLM is not involved. Nothing in the user's folder is ever
 * moved, renamed, changed or deleted.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ValidationError, NotFoundError } = require("../utils/errors");
const { localDate, daysBetween } = require("../utils/time");
const { MAX_BYTES, MAX_TEXT, detectType, extractText, cleanFilename, saveResume } = require("./documentService");
const { requireApplication, describe } = require("./applicationService");

const SETTLE_MS = 5000; // a file changed this recently may still be being written
const MANUAL_SETTLE_MS = 2000;
const MAX_NEW_PER_SCAN = 20; // keeps the first look at a big folder from stalling the minute tick
const EXTENSIONS = new Set([".pdf", ".docx"]);
const STATUS_KEY = "resume_scan";
const BASELINE_KEY = "resume_baseline"; // the folder whose existing files were noted without being offered

// Needs a company in the file name plus enough extra signal, and a clear lead over the runner-up.
const SURE_SCORE = 10;
const SURE_GAP = 3;
const MAX_GUESSES = 3;

// Words that say nothing about which job a file is for.
const FILLER = new Set(
  "resume cv curriculum vitae final copy new latest updated tailored version draft for the and of to at pdf docx doc inc ltd llc corp co corporation company".split(" "),
);

const scanning = new WeakMap(); // app -> the scan in progress, so a click and the minute tick never overlap

// --- Matching -------------------------------------------------------------

/** Lower-case words of `text` without filler, numbers and version tags ("v2"). */
function words(text, skip = new Set()) {
  return String(text ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2 && !/^\d+$/.test(word) && !/^v\d+$/.test(word) && !FILLER.has(word) && !skip.has(word));
}

/** Like words(), but "ShopiFy" stays one word: for folder names, which are written by hand. */
function plainWords(text) {
  return String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 2 && !FILLER.has(word));
}

/** Cover letters and transcripts are saved next to résumés but are not résumés ("Resume_Transcript_merged" is one). */
function isResumeLike(filename) {
  const name = stem(filename);
  const parts = plainWords(name);
  if (parts.some((part) => ["cover", "letter", "cl"].includes(part))) return false;
  return !parts.includes("transcript") || /resume|cv/i.test(name);
}

function stem(filename) {
  return path.basename(filename, path.extname(filename));
}

/** The sub-folder a file sits in, usually the company ("Shopify" for Shopify/Resume.pdf), or "" when it is directly in the résumé folder. */
function groupOf(ctx, row) {
  const folder = folderOf(ctx);
  const parent = path.dirname(row.path);
  return folder && path.relative(folder, parent) !== "" ? path.basename(parent) : "";
}

/** Everything about a file that matching needs, worked out once. */
function prepare(ctx, row) {
  const skip = new Set(words(ctx.config.userName));
  const base = stem(row.filename);
  const group = groupOf(ctx, row);
  return {
    skip,
    tokens: new Set([...words(base, skip), ...words(group, skip), ...plainWords(group).filter((word) => !skip.has(word))]),
    compact: `${group}${base}`.toLowerCase().replace(/[^a-z0-9]/g, ""),
    text: row.text.toLowerCase(),
    date: localDate(new Date(row.mtime_ms), ctx.config.timezone),
  };
}

function companyScore(file, company) {
  const parts = words(company);
  if (parts.length === 0) return 0;
  if (parts.every((part) => file.tokens.has(part))) return 10;
  if (parts.join("").length >= 4 && file.compact.includes(parts.join(""))) return 8;
  if (parts.length > 1 && parts.some((part) => part.length >= 4 && file.tokens.has(part))) return 4;
  return 0;
}

/** 0 when the file name does not name the application's company; otherwise higher is a closer match. */
function score(file, application) {
  const company = companyScore(file, application.company);
  if (company === 0) return 0;

  let total = company;
  const parts = words(application.company);
  if (parts.length > 0 && new RegExp(`\\b${parts.join("\\W+")}\\b`).test(file.text)) total += 2;

  const roleWords = words(application.role).filter((word) => !parts.includes(word));
  total += 2 * Math.min(3, roleWords.filter((word) => file.tokens.has(word)).length);

  const days = Math.abs(daysBetween(application.applied_on, file.date));
  if (days <= 1) total += 3;
  else if (days <= 3) total += 2;
  else if (days <= 7) total += 1;

  if (!application.resume_filename) total += 1;
  return total;
}

function rank(ctx, row, applications) {
  const file = prepare(ctx, row);
  return applications
    .map((application) => ({ application, score: score(file, application) }))
    .filter((guess) => guess.score > 0)
    .sort((a, b) => b.score - a.score || b.application.applied_on.localeCompare(a.application.applied_on));
}

/** The one application a file clearly belongs to, or null. */
function sureMatch(ranked) {
  const [top, next] = ranked;
  if (!top || top.score < SURE_SCORE || top.application.resume_filename) return null;
  if (next && top.score - next.score < SURE_GAP) return null;
  return top.application;
}

/** A starting point for "New application" from a file name: "Mit_Patel_Shopify_SWE.pdf" gives "Shopify Swe". */
function suggestName(ctx, filename) {
  const parts = words(stem(filename), new Set(words(ctx.config.userName)));
  return parts.map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

// --- The folder -----------------------------------------------------------

function folderOf(ctx) {
  const folder = ctx.config.resumeFolder;
  return folder ? path.resolve(folder) : "";
}

/**
 * The résumé-looking files in `folder` and one level of sub-folders below it.
 * Symlinks, hidden and temp files, other file types, and cover letters or
 * transcripts are left out.
 */
function listFolder(folder) {
  const read = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
  };
  const entries = read(folder);
  if (!entries) throw new Error(`Can't read the résumé folder ${folder}. Is it still there?`);

  const files = [];
  const add = (dir, entry) => {
    if (!entry.isFile() || entry.name.startsWith("~$") || entry.name.startsWith(".")) return;
    if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase()) || !isResumeLike(entry.name)) return;
    const file = path.join(dir, entry.name);
    try {
      const { size, mtimeMs } = fs.statSync(file);
      files.push({ path: file, filename: entry.name, size, mtimeMs: Math.floor(mtimeMs) });
    } catch {
      // gone or locked since the listing: the next scan sees it again
    }
  };

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const dir = path.join(folder, entry.name);
      for (const inner of read(dir) ?? []) add(dir, inner);
    } else {
      add(folder, entry);
    }
  }
  return files;
}

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

/** The file's bytes, if it is still the file that was found, directly in the folder. */
function readCurrent(ctx, row) {
  const folder = folderOf(ctx);
  const inside = folder ? path.relative(folder, path.dirname(row.path)) : "..";
  if (!folder || inside.startsWith("..") || path.isAbsolute(inside) || inside.includes(path.sep)) {
    throw new ValidationError("That file is not in your résumé folder any more.");
  }
  let stat;
  try {
    stat = fs.lstatSync(row.path);
  } catch {
    throw new NotFoundError("That file is gone from the folder.");
  }
  if (!stat.isFile()) throw new ValidationError("That is not a regular file.");
  const buffer = fs.readFileSync(row.path);
  if (sha256(buffer) !== row.sha256) throw new ValidationError("That file changed since it was found. Click Check now and try again.");
  return buffer;
}

/** The application that already holds this very file (uploaded by hand earlier), or null. */
function alreadySaved(ctx, file, applications) {
  const saved = cleanFilename(file.filename, path.extname(file.filename).slice(1).toLowerCase());
  return (
    applications.find((application) => application.resume_filename === saved && ctx.store.documents.info(application.id)?.size === file.size) ??
    null
  );
}

// --- Scanning -------------------------------------------------------------

/**
 * Looks at the folder once. Returns { configured, error, found, added, attached }.
 * `added` counts new files waiting for the user; `attached` lists files put on
 * an application by themselves. Problems with the folder are reported, not thrown.
 */
function scan(ctx, { settleMs = SETTLE_MS } = {}) {
  const running = scanning.get(ctx.app);
  if (running) return running;
  const work = runScan(ctx, settleMs).finally(() => scanning.delete(ctx.app));
  scanning.set(ctx.app, work);
  return work;
}

async function runScan(ctx, settleMs) {
  const { resumeFiles } = ctx.store;
  const folder = folderOf(ctx);
  const done = (result) => {
    ctx.store.meta.set(STATUS_KEY, JSON.stringify({ at: ctx.clock().toISOString(), found: result.found, error: result.error }));
    return result;
  };

  if (!folder) {
    for (const row of resumeFiles.listPending()) resumeFiles.delete(row.id);
    return { configured: false, error: null, found: 0, added: 0, attached: [] };
  }

  let files;
  try {
    files = listFolder(folder);
  } catch (error) {
    return done({ configured: true, error: error.message, found: 0, added: 0, attached: [] });
  }

  const present = new Set(files.map((file) => file.path));

  // The first look at a folder only notes what is already there: a folder of old résumés is not a to-do list.
  const baseline = ctx.store.meta.get(BASELINE_KEY) !== folder;
  let added = 0;
  let handled = 0;
  let complete = true;
  const applications = ctx.store.applications.list();
  for (const file of files) {
    if (file.size === 0 || file.size > MAX_BYTES) continue;
    if (Date.now() - file.mtimeMs < settleMs) {
      complete = false; // still being written: the baseline is not finished until it is seen
      continue;
    }
    const known = resumeFiles.forPath(file.path);
    if (known.some((row) => row.size === file.size && row.mtime_ms === file.mtimeMs)) continue; // nothing changed
    if (handled >= MAX_NEW_PER_SCAN) {
      complete = false;
      break;
    }

    let buffer;
    try {
      buffer = fs.readFileSync(file.path);
    } catch {
      continue;
    }
    const hash = sha256(buffer);

    const same = known.find((row) => row.sha256 === hash);
    if (same) {
      resumeFiles.touch(same.id, file); // saved again, same content
      continue;
    }
    const renamed = resumeFiles.forHash(hash).find((row) => !present.has(row.path));
    if (renamed) {
      resumeFiles.move(renamed.id, file); // same content under a new name: not offered again
      continue;
    }
    for (const old of known) if (old.status === "pending") resumeFiles.delete(old.id); // replaced by newer content

    handled += 1;
    const type = detectType(buffer);
    let text = "";
    if (type && !baseline) {
      try {
        text = (await extractText(buffer, type)).replace(/\s+\n/g, "\n").trim().slice(0, MAX_TEXT);
      } catch {
        // an unreadable file is still offered; attaching it explains what is wrong
      }
    }
    const row = resumeFiles.create({ ...file, sha256: hash, text, status: type && !baseline ? "pending" : "ignored" });
    if (!row || !type || baseline) continue;

    const holder = alreadySaved(ctx, file, applications);
    if (holder) resumeFiles.setState(row.id, { status: "attached", applicationId: holder.id });
    else added += 1;
  }

  if (baseline && complete) ctx.store.meta.set(BASELINE_KEY, folder);

  // After the loop, so a renamed file was moved onto its new name first. What is left is deleted or moved away.
  for (const row of resumeFiles.listPending()) if (!present.has(row.path)) resumeFiles.delete(row.id);

  const attached = ctx.config.resumeAutoAttach ? await attachSureMatches(ctx) : [];
  const waiting = added - attached.length;
  if (waiting > 0) ctx.publish({ type: "resume_inbox", count: waiting });
  else if (added > 0) ctx.publish({ type: "data_changed" });
  return done({ configured: true, error: null, found: files.length, added, attached });
}

/** Attaches each waiting file that clearly belongs to one application; publishes one event per file so the page can offer Undo. */
async function attachSureMatches(ctx) {
  const attached = [];
  for (const row of ctx.store.resumeFiles.listPending()) {
    if (row.no_auto) continue;
    const application = sureMatch(rank(ctx, row, ctx.store.applications.list())); // fresh list: an earlier file may have filled this one
    if (!application) continue;
    try {
      await attachRow(ctx, row, application.id, { auto: true });
    } catch (error) {
      console.error(`Attaching ${row.filename} on its own failed: ${error.message}`);
      ctx.store.resumeFiles.setState(row.id, { status: "pending", noAuto: true });
      continue;
    }
    const label = describe(application);
    attached.push({ file_id: row.id, application_id: application.id, filename: row.filename, label });
    ctx.publish({ type: "resume_attached", file_id: row.id, application_id: application.id, filename: row.filename, label });
  }
  return attached;
}

// --- What the user sees and does -----------------------------------------

/** Files waiting for the user, newest first, each with its best guesses. */
function inbox(ctx) {
  const applications = ctx.store.applications.list();
  return ctx.store.resumeFiles.listPending().map((row) => {
    const ranked = rank(ctx, row, applications);
    return {
      id: row.id,
      filename: row.filename,
      folder: groupOf(ctx, row),
      size: row.size,
      modified_at: new Date(row.mtime_ms).toISOString(),
      suggested_name: suggestName(ctx, row.filename),
      sure: Boolean(sureMatch(ranked)),
      guesses: ranked.slice(0, MAX_GUESSES).map(({ application }) => ({
        application_id: application.id,
        company: application.company,
        role: application.role,
        status: application.status,
        applied_on: application.applied_on,
        resume_filename: application.resume_filename,
      })),
    };
  });
}

/** For Settings: is a folder set, and what did the last look find. */
function status(ctx) {
  const folder = folderOf(ctx);
  let last = null;
  try {
    if (folder) last = JSON.parse(ctx.store.meta.get(STATUS_KEY));
  } catch {
    // never scanned
  }
  return { folder, auto_attach: ctx.config.resumeAutoAttach, last_scan: last };
}

function requireFile(ctx, id) {
  const row = ctx.store.resumeFiles.get(id);
  if (!row) throw new NotFoundError(`Résumé file #${id} does not exist.`);
  return row;
}

async function attachRow(ctx, row, applicationId, { auto = false } = {}) {
  requireApplication(ctx, applicationId);
  const buffer = readCurrent(ctx, row);
  const resume = await saveResume(ctx, applicationId, { originalname: row.filename, buffer, size: buffer.length });
  ctx.store.resumeFiles.setState(row.id, { status: "attached", applicationId, autoAttached: auto });
  return resume;
}

/** Puts a waiting file on an application (replacing its résumé, if it has one). */
async function attach(ctx, id, applicationId) {
  const row = requireFile(ctx, id);
  if (row.status === "attached") throw new ValidationError("That file is already attached.");
  const resume = await attachRow(ctx, row, applicationId);
  return { resume, file: ctx.store.resumeFiles.get(id) };
}

function ignore(ctx, id) {
  requireFile(ctx, id);
  return ctx.store.resumeFiles.setState(id, { status: "ignored" });
}

function ignoreAll(ctx) {
  const rows = ctx.store.resumeFiles.listPending();
  for (const row of rows) ctx.store.resumeFiles.setState(row.id, { status: "ignored" });
  return rows.length;
}

/** Takes an attached file back off its application and puts it in the inbox; it will not be attached on its own again. */
function undo(ctx, id) {
  const row = requireFile(ctx, id);
  if (row.status !== "attached" || !row.application_id) throw new ValidationError("That file is not attached.");
  const saved = ctx.store.documents.info(row.application_id);
  const name = cleanFilename(row.filename, path.extname(row.filename).slice(1).toLowerCase());
  if (saved && saved.filename === name) ctx.store.documents.delete(row.application_id);
  return ctx.store.resumeFiles.setState(id, { status: "pending", noAuto: true });
}

module.exports = { scan, inbox, status, attach, ignore, ignoreAll, undo, MANUAL_SETTLE_MS, suggestName, words };
