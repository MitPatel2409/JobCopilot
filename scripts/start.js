/**
 * One command to run Job-Copilot locally: `npm start` from the project root.
 *
 * Checks Node and server/.env, installs dependencies the first time, then
 * runs the server (:5000) and the client (:5173) together with their output
 * labelled, opens the browser, and stops both on Ctrl+C or when either exits.
 */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

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

const COLORS = { server: "\x1b[36m", client: "\x1b[35m" };
const RESET = "\x1b[0m";
const children = [];
let stopping = false;

/** Runs `npm run dev` in `dir`, prefixing each line of its output with its name. */
function run(name, dir, extraArgs = []) {
  const child = spawn(NPM, ["run", "dev", ...(extraArgs.length ? ["--", ...extraArgs] : [])], {
    cwd: dir,
    shell: WINDOWS,
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const label = `${COLORS[name]}[${name}]${RESET} `;
  for (const stream of [child.stdout, child.stderr]) {
    let pending = "";
    stream.on("data", (chunk) => {
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) process.stdout.write(label + line + "\n");
    });
  }
  child.on("exit", (code) => {
    if (!stopping) {
      console.log(`\n${label}stopped (exit code ${code}). Stopping the other one too.`);
      stopAll(code ?? 1);
    }
  });
  children.push(child);
}

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // npm runs the real server in a child process; on Windows, end the whole tree.
    if (WINDOWS) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGINT");
  }
  process.exit(code);
}

checkNode();
checkEnv();
installIfNeeded(SERVER, "server");
installIfNeeded(CLIENT, "client");

console.log("\nStarting Job-Copilot. Open http://localhost:5173 (Ctrl+C stops everything).\n");
run("server", SERVER);
run("client", CLIENT, ["--open"]);

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
