const config = require("./config/env");

if (!config.geminiApiKey) {
  console.error("GEMINI_API_KEY is missing. Copy .env.example to .env and add your key.");
  process.exit(1);
}
try {
  new Intl.DateTimeFormat("en-US", { timeZone: config.timezone });
} catch {
  console.error(`APP_TIMEZONE "${config.timezone}" is not a valid timezone (e.g. America/Toronto).`);
  process.exit(1);
}

const http = require("node:http");
const { openDatabase } = require("./services/db/database");
const { createContext } = require("./services/context");
const { loadAppSecret } = require("./services/auth/tokenVault");
const { createScheduler } = require("./services/scheduler/scheduler");
const { createApp } = require("./app");
const llm = require("./services/llm");

const settings = { ...config, appSecret: loadAppSecret(config) };
const app = createContext({ db: openDatabase(config.dbPath), llm, config: settings });
const handler = createApp(app);

/**
 * There is no sign-in, so by default the server only listens on this
 * computer: 127.0.0.1, and ::1 too where IPv6 is on (browsers may resolve
 * "localhost" to either).
 */
function listen(host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once("error", reject);
    server.listen(config.port, host, resolve);
  });
}

async function start() {
  if (config.host === "loopback") {
    await listen("127.0.0.1");
    await listen("::1").catch(() => {}); // no IPv6 on this machine
  } else {
    await listen(config.host);
  }

  const where = config.host === "loopback" ? "localhost" : config.host;
  console.log(`Server is running on http://${where}:${config.port} (model: ${config.geminiModel})`);
  console.log(
    app.oauth.configured
      ? "Google connectors: available. Connect Calendar and Gmail in Settings."
      : "Google connectors: off (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to use Calendar and Gmail).",
  );
  createScheduler(app).start();
}

start().catch((error) => {
  console.error(`Could not start the server: ${error.message}`);
  process.exit(1);
});
