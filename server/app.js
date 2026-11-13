const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const routes = require("./routes");
const { checkHost, checkOrigin, useOwner } = require("./middleware/auth");

/** Builds the Express app around the server context from services/context.js. */
function createApp(app) {
  const server = express();
  server.locals.app = app;

  // Middleware. `credentials` lets the browser keep the short-lived cookie of the Google connect flow.
  server.use(checkHost);
  server.use(cors({ origin: app.config.clientOrigins, credentials: true }));
  server.use(express.json({ limit: "1mb" }));
  server.use(checkOrigin);
  server.use(useOwner);

  // Routes
  server.use("/auth", authRoutes);
  server.use("/", routes);

  // ValidationError / NotFoundError / ... carry a status and a message safe to show.
  // eslint-disable-next-line no-unused-vars
  server.use((error, req, res, next) => {
    if (error.status && error.status < 500) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Unhandled error:", error);
    res.status(500).json({ error: "Something went wrong." });
  });

  return server;
}

module.exports = { createApp };
