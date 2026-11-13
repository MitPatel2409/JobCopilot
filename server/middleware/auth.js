/**
 * Job-Copilot has no sign-in: it runs on your own computer for one person.
 * These checks are what keep other web pages and other machines out.
 */
const { ForbiddenError } = require("../utils/errors");

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The request must be addressed to this server by a name it answers to.
 * Stops a page on another site from reaching the API by pointing its own
 * domain at 127.0.0.1 (DNS rebinding).
 */
function checkHost(req, res, next) {
  const host = (req.get("Host") ?? "").replace(/:\d+$/, "").toLowerCase();
  if (!req.app.locals.app.config.allowedHosts.includes(host) && !LOOPBACK_HOSTS.has(host)) {
    return next(new ForbiddenError("This server only answers to localhost."));
  }
  next();
}

/** Requests that change something must come from the app's own pages. */
function checkOrigin(req, res, next) {
  const origin = req.get("Origin");
  if (req.method !== "GET" && req.method !== "HEAD" && origin && !req.app.locals.app.config.clientOrigins.includes(origin)) {
    return next(new ForbiddenError("This request did not come from Job-Copilot."));
  }
  next();
}

/** Every request acts for the owner: `req.user`, and their context as `req.ctx`. */
function useOwner(req, res, next) {
  const app = req.app.locals.app;
  req.user = app.users.owner();
  req.ctx = app.forUser(req.user);
  next();
}

module.exports = { checkHost, checkOrigin, useOwner };
