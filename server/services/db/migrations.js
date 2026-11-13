/**
 * Brings a database made by an older version up to schema.sql. It runs
 * before the schema on every start and does nothing once the database is
 * current (or new).
 *
 * The one big step is the owner: rows made before the users table existed
 * are given to the (single) user row, made here when needed.
 */

// Columns added to existing tables: [table, column, definition].
const ADDED_COLUMNS = [
  ["applications", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE"],
  ["applications", "jd_text", "TEXT NOT NULL DEFAULT ''"],
  ["applications", "jd_saved_at", "TEXT"],
  ["applications", "interview_on", "TEXT"],
  ["contacts", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE"],
  ["outreach", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE"],
  ["outreach", "gmail_draft_id", "TEXT"],
  ["reminders", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE"],
  ["chat_messages", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE"],
  ["study_topics", "plan", "TEXT NOT NULL DEFAULT ''"],
  ["reminders", "tag", "TEXT"],
];

// Tables whose key now includes the user, so they are rebuilt: [table, columns to copy].
const REBUILT_TABLES = [
  ["study_topics", "id, name, created_at"],
  ["journal_entries", "date, summary, updated_at"],
  ["meta", "key, value"],
];

const OWNED_TABLES = ["applications", "contacts", "outreach", "reminders", "chat_messages"];

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

/** The CREATE TABLE statement for `table` in schema.sql, renamed to `as`. */
function createStatement(schema, table, as = table) {
  const match = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!match) throw new Error(`schema.sql has no table "${table}".`);
  return `CREATE TABLE IF NOT EXISTS ${as} (${match[1]}\n);`;
}

/** Call with foreign keys off: rebuilding a table that others point at would otherwise cascade. */
function migrate(db, schema) {
  if (!tableExists(db, "applications")) return; // a new database: schema.sql creates everything

  db.exec("BEGIN");
  try {
    db.exec(createStatement(schema, "users"));

    for (const [table, column, definition] of ADDED_COLUMNS) {
      if (tableExists(db, table) && !hasColumn(db, table, column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }

    const toRebuild = REBUILT_TABLES.filter(([table]) => tableExists(db, table) && !hasColumn(db, table, "user_id"));
    const unowned = OWNED_TABLES.some((table) => db.prepare(`SELECT 1 FROM ${table} WHERE user_id IS NULL LIMIT 1`).get());

    if (toRebuild.length > 0 || unowned) {
      const owner = ownerId(db);
      for (const table of OWNED_TABLES) db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(owner);
      for (const [table, columns] of toRebuild) {
        db.exec(createStatement(schema, table, `${table}_new`));
        db.prepare(`INSERT INTO ${table}_new (user_id, ${columns}) SELECT ?, ${columns} FROM ${table}`).run(owner);
        db.exec(`DROP TABLE ${table}`);
        db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** The owner row, made on first need. */
function ownerId(db) {
  const existing = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get();
  if (existing) return existing.id;
  const { lastInsertRowid } = db.prepare("INSERT INTO users (email, created_at) VALUES ('', ?)").run(new Date().toISOString());
  return Number(lastInsertRowid);
}

module.exports = { migrate };
