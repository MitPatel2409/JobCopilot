const multer = require("multer");
const { ValidationError } = require("../utils/errors");
const { MAX_BYTES } = require("../services/documentService");

// Files stay in memory: they go straight into the database.
const single = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 5 } }).single("file");

/** Reads one uploaded file from the "file" field into `req.file`. */
function uploadOne(req, res, next) {
  single(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") return next(new ValidationError("The file is over 5 MB."));
    next(new ValidationError("The upload could not be read. Send one file in the \"file\" field."));
  });
}

/** Sends a stored document as a download. */
function sendDocument(res, document) {
  const ascii = document.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  res.setHeader("Content-Type", document.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(Buffer.from(document.content));
}

module.exports = { uploadOne, sendDocument };
