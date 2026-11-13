const { one, all, nowIso } = require("../database");

function parse(row) {
  return row && { ...row, actions: JSON.parse(row.actions) };
}

function createChatRepo(db, userId) {
  const insert = db.prepare("INSERT INTO chat_messages (user_id, role, content, actions, created_at) VALUES (?, ?, ?, ?, ?)");
  const byId = db.prepare("SELECT * FROM chat_messages WHERE id = ?");
  const latest = db.prepare("SELECT * FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?");

  return {
    add({ role, content, actions = [] }) {
      const { lastInsertRowid } = insert.run(userId, role, content, JSON.stringify(actions), nowIso());
      return parse(one(byId, Number(lastInsertRowid)));
    },

    /** The last `limit` messages, oldest first. */
    recent(limit) {
      return all(latest, userId, limit).reverse().map(parse);
    },
  };
}

module.exports = { createChatRepo };
