/**
 * One command to run Job-Copilot locally: `npm start` from the project root.
 *
 * Checks Node and server/.env, installs dependencies the first time, then
 * runs the server (:5000) and the client (:5173) together with their output
 * labelled, opens the browser, and stops both on Ctrl+C, when the window is
 * closed, or when either exits. If Job-Copilot is already running, it just
 * opens the browser. (For working on the code with auto-reload, run
 * `npm run dev` in server/ and client/ instead.)
 */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const SERVER = path.join(ROOT, "server");
const CLIENT = path.join(ROOT, "client");
const WINDOWS = process.platform === "win32";
const NPM = WINDOWS ? "npm.cmd" : "npm";

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    fail(`Job-Copilot needs Node 22.13 or newer (you have ${process.versions.node}). Get it from https://nodejs.org/`);
  }
}

function checkEnv() {
  const envFile = path.join(SERVER, ".env");
  if (!fs.existsSync(envFile)) {
    fs.copyFileSync(path.join(SERVER, ".env.example"), envFile);
    fail(`Created server/.env from the example. Open it, paste your GEMINI_API_KEY (https://aistudio.google.com/apikey), then run npm start again.`);
  }
  if (!/^GEMINI_API_KEY=\S+/m.test(fs.readFileSync(envFile, "utf8"))) {
    fail(`GEMINI_API_KEY is empty in server/.env. Paste your key (https://aistudio.google.com/apikey), then run npm start again.`);
  }
}

/** `npm install` in a folder that has never been installed. */
function installIfNeeded(dir, name) {
  if (fs.existsSync(path.join(dir, "node_modules"))) return;
  console.log(`Installing ${name} dependencies (first run only)…`);
  const result = spawnSync(NPM, ["install"], { cwd: dir, stdio: "inherit", shell: WINDOWS });
  if (result.status !== 0) fail(`npm install failed in ${name}/.`);
}

const LABELS = { server: "\x1b[36m[server]\x1b[0m ", client: "\x1b[35m[client]\x1b[0m " };
let server = null; // the API server's child process
let vite = null; // the client dev server, running inside this process
let stopping = false;

const say = (name, text) => process.stdout.write(`${LABELS[name]}${text}\n`);

/**
 * Runs the API server as a direct `node` child (no npm, cmd or nodemon in
 * between). EXIT_WITH_PARENT makes it stop when this launcher's end of its
 * stdin pipe closes, so it cannot outlive the launcher, however that stops.
 */
function startServer() {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "index.js"], {
    cwd: SERVER,
    env: { ...process.env, FORCE_COLOR: "1", EXIT_WITH_PARENT: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  for (const stream of [server.stdout, server.stderr]) {
    let pending = "";
    stream.on("data", (chunk) => {
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) say("server", line);
    });
  }
  server.on("exit", (code) => {
    if (!stopping) {
      say("server", `stopped (exit code ${code}). Stopping the client too.`);
      stopAll(code ?? 1);
    }
  });
}

/**
 * Runs the Vite dev server inside this process, through its API, so it ends
 * with the launcher. --strictPort matters: the API only accepts :5173.
 */
async function startClient() {
  const { createServer, createLogger } = await import(pathToFileURL(path.join(CLIENT, "node_modules", "vite", "dist", "node", "index.js")).href);
  const logger = createLogger("info", { prefix: "" });
  for (const level of ["info", "warn", "error"]) {
    const original = logger[level].bind(logger);
    logger[level] = (message, options) => {
      for (const line of String(message).split(/\r?\n/)) original(`${LABELS.client}${line}`, options);
    };
  }
  vite = await createServer({
    root: CLIENT,
    configFile: path.join(CLIENT, "vite.config.js"),
    customLogger: logger,
    server: { port: 5173, strictPort: true, open: true },
  });
  await vite.listen();
  vite.printUrls();
}

async function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  if (server && server.exitCode === null) {
    if (WINDOWS) spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGINT");
  }
  await vite?.close().catch(() => {});
  process.exit(code);
}

const SERVER_URL = "http://localhost:5000";
const APP_URL = "http://localhost:5173";

/** The HTTP status of `url`, or null when nothing answers there. */
async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.status;
  } catch {
    return null;
  }
}

function openBrowser(url) {
  const [command, args] = WINDOWS ? ["cmd", ["/c", "start", "", url]] : [process.platform === "darwin" ? "open" : "xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true }).unref();
}

/**
 * Starting a second copy cannot work (both ports are taken) and would leave
 * a crashed server waiting in the background, so when Job-Copilot is
 * already up, open it instead.
 */
async function checkAlreadyRunning() {
  const [server, client] = await Promise.all([probe(`${SERVER_URL}/today`), probe(APP_URL)]);
  if (server === 200 && client === 200) return { running: true };
  if (server !== null && server !== 200) return { problem: "Something else is using port 5000. Close it, or stop the other Job-Copilot window, and try again." };
  if (server === 200) {
    return {
      problem:
        "A Job-Copilot server is still running on port 5000 without its client, left over from an earlier run. " +
        "End it (Task Manager → Details → node.exe, or restart the computer), then start Job-Copilot again.",
    };
  }
  if (client !== null) return { problem: "Something else is using port 5173. Close it, or stop the other Job-Copilot window, and try again." };
  return {};
}

async function main() {
  checkNode();
  checkEnv();

  // After a fetch, let Node end on its own: process.exit() here can crash Node on Windows.
  const { running, problem } = await checkAlreadyRunning();
  if (running) {
    console.log(`Job-Copilot is already running. Opening ${APP_URL}`);
    openBrowser(APP_URL);
    return;
  }
  if (problem) {
    console.error(`\n${problem}\n`);
    process.exitCode = 1;
    return;
  }

  installIfNeeded(SERVER, "server");
  installIfNeeded(CLIENT, "client");

  console.log(`\nStarting Job-Copilot. Open ${APP_URL} (Ctrl+C or closing this window stops everything).\n`);
  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));
  process.on("SIGHUP", () => stopAll(0)); // the window was closed (Windows sends this on close)

  startServer();
  try {
    await startClient();
  } catch (error) {
    say("client", `could not start: ${error.message}`);
    stopAll(1);
  }
}

main();
