const { one } = require("../database");

function createMetaRepo(db, userId) {
  const read = db.prepare("SELECT value FROM meta WHERE user_id = ? AND key = ?");
  const write = db.prepare(
    "INSERT INTO meta (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value",
  );

  return {
    get(key) {
      return one(read, userId, key)?.value ?? null;
    },

    set(key, value) {
      write.run(userId, key, String(value));
    },
  };
}

module.exports = { createMetaRepo };
