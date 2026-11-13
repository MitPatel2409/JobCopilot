/**
 * Résumé uploads: checks the file, pulls its text out for the prep guide,
 * and saves both. PDF text comes from pdf-parse, DOCX from mammoth.
 */
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");
const { ValidationError } = require("../utils/errors");
const { requireApplication } = require("./applicationService");

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 50000;

const TYPES = {
  pdf: { mime: "application/pdf", magic: "%PDF" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: "PK" },
};

/** Which kind of file this is, from its first bytes (the browser's MIME type is not trusted). */
function detectType(buffer) {
  const head = buffer.subarray(0, 4).toString("latin1");
  return Object.keys(TYPES).find((type) => head.startsWith(TYPES[type].magic)) ?? null;
}

async function extractText(buffer, type) {
  if (type === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  return (await mammoth.extractRawText({ buffer })).value;
}

/**
 * Saves `file` (from multer: originalname, buffer) as the résumé for
 * `applicationId`, or as the base résumé when it is null.
 */
async function saveResume(ctx, applicationId, file) {
  if (!file) throw new ValidationError("Choose a PDF or Word (.docx) file.");
  if (file.size > MAX_BYTES) throw new ValidationError("The file is over 5 MB.");

  const type = detectType(file.buffer);
  if (!type) throw new ValidationError("Only PDF and Word (.docx) files can be uploaded.");

  let text;
  try {
    text = (await extractText(file.buffer, type)).replace(/\s+\n/g, "\n").trim().slice(0, MAX_TEXT);
  } catch {
    throw new ValidationError("That file could not be read. Is it a valid PDF or .docx?");
  }

  return ctx.store.documents.save(applicationId, {
    filename: cleanFilename(file.originalname, type),
    mime: TYPES[type].mime,
    content: file.buffer,
    text,
  });
}

/**
 * Gives `toApplicationId` the same résumé as `fromApplicationId` (or the base
 * résumé when that is null), for "I sent the same résumé as for X".
 */
function copyResume(ctx, toApplicationId, fromApplicationId) {
  requireApplication(ctx, toApplicationId);
  if (fromApplicationId !== null) requireApplication(ctx, fromApplicationId);
  if (!ctx.store.documents.info(fromApplicationId)) {
    throw new ValidationError(fromApplicationId === null ? "There is no base résumé in Settings." : `Application #${fromApplicationId} has no résumé saved.`);
  }
  if (fromApplicationId === toApplicationId) throw new ValidationError("That is the same application.");
  return ctx.store.documents.copy(fromApplicationId, toApplicationId);
}

/** The résumé text for an application: its tailored one, else the base résumé, else "". */
function resumeTextFor(ctx, applicationId) {
  return ctx.store.documents.text(applicationId) ?? ctx.store.documents.text(null) ?? "";
}

function cleanFilename(name, type) {
  const base = String(name ?? "resume").replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "resume";
  return base.toLowerCase().endsWith(`.${type}`) ? base : `${base}.${type}`;
}

module.exports = { MAX_BYTES, saveResume, copyResume, resumeTextFor };
