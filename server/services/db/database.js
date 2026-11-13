/**
 * Opens the SQLite database (Node's built-in node:sqlite), upgrades it if an
 * older version made it, and applies the schema.
 * Pass ":memory:" for a throwaway database in tests.
 */
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { migrate } = require("./migrations");

const SCHEMA = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

function openDatabase(file = ":memory:") {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  // Foreign keys stay off while an older database is brought up to date.
  db.exec("PRAGMA foreign_keys = OFF;");
  migrate(db, SCHEMA);
  db.exec(SCHEMA);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

// node:sqlite returns rows with a null prototype; copy them into plain objects.
function one(statement, ...params) {
  const row = statement.get(...params);
  return row ? { ...row } : null;
}

function all(statement, ...params) {
  return statement.all(...params).map((row) => ({ ...row }));
}

/** Runs `work` in a transaction and returns its result. */
function transaction(db, work) {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Builds "a = ?, b = ?" and its values from the allowed keys present in `fields`. */
function setClause(fields, allowed) {
  const keys = allowed.filter((key) => fields[key] !== undefined);
  return { sql: keys.map((key) => `${key} = ?`).join(", "), values: keys.map((key) => fields[key]) };
}

const nowIso = () => new Date().toISOString();

module.exports = { openDatabase, one, all, transaction, setClause, nowIso };
