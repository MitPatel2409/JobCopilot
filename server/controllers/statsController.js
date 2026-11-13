const { buildStats } = require("../services/statsService");

/** Everything the "Insights" view shows, in one request. */
exports.stats = (req, res) => {
  res.json(buildStats(req.ctx));
};
