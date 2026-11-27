/**
 * The résumé folder watcher (services/resumeFolderService.js): files found in
 * the user's résumé folder, waiting to be put on an application.
 */
const args = require("../utils/args");
const { MANUAL_SETTLE_MS, scan, inbox, status, attach, ignore, ignoreAll, undo } = require("../services/resumeFolderService");

const snapshot = (ctx) => ({ ...status(ctx), files: inbox(ctx) });

exports.list = (req, res) => {
  res.json(snapshot(req.ctx));
};

/** "Check now": looks at the folder right away. */
exports.scan = async (req, res) => {
  const result = await scan(req.ctx, { settleMs: MANUAL_SETTLE_MS });
  res.json({ ...snapshot(req.ctx), result });
};

exports.attach = async (req, res) => {
  const ctx = req.ctx;
  const { resume } = await attach(ctx, args.id(req.params, "id", { required: true }), args.id(req.body ?? {}, "application_id", { required: true }));
  res.json({ resume, ...snapshot(ctx) });
};

exports.ignore = (req, res) => {
  ignore(req.ctx, args.id(req.params, "id", { required: true }));
  res.json(snapshot(req.ctx));
};

exports.ignoreAll = (req, res) => {
  ignoreAll(req.ctx);
  res.json(snapshot(req.ctx));
};

exports.undo = (req, res) => {
  undo(req.ctx, args.id(req.params, "id", { required: true }));
  res.json(snapshot(req.ctx));
};
