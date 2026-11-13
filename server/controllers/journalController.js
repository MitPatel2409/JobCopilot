const args = require("../utils/args");

exports.list = (req, res) => {
  const entries = req.ctx.store.journal.list({
    from: args.date(req.query, "from"),
    to: args.date(req.query, "to"),
  });
  res.json({ entries });
};

/** Adds one line to a day (today by default). */
exports.append = (req, res) => {
  const ctx = req.ctx;
  const body = req.body ?? {};
  const date = args.date(body, "date") ?? ctx.today();
  res.status(201).json({ entry: ctx.store.journal.append(date, args.text(body, "line", { required: true, max: 500 })) });
};

/** Replaces a day's whole entry, one line per line; an empty one deletes the day. */
exports.replace = (req, res) => {
  const ctx = req.ctx;
  const date = args.date(req.params, "date", { required: true });
  const summary = String(req.body?.summary ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 10000);
  res.json({ entry: ctx.store.journal.replace(date, summary) });
};
