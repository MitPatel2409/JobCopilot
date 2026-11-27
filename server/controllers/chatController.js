const { runChat } = require("../services/agent/runChat");
const { explainLlmError } = require("../services/llm/llmErrors");
const { openNdjsonStream } = require("../utils/ndjsonStream");

const HISTORY_LIMIT = 50;

exports.history = (req, res) => {
  res.json({ messages: req.ctx.store.chat.recent(HISTORY_LIMIT) });
};

/** Runs the agent on one message and streams its actions as NDJSON. */
exports.chat = async (req, res) => {
  const ctx = req.ctx;
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "Type a message first." });

  const stream = openNdjsonStream(res);
  try {
    const result = await runChat({
      ctx,
      message,
      maxTurns: ctx.config.agentMaxTurns,
      onEvent: stream.send,
      signal: stream.signal,
    });
    stream.send({ type: "done", reply: result.reply, message: result.message, stopReason: result.stopReason });
    ctx.publish({ type: "data_changed" });
  } catch (error) {
    console.error("Chat failed:", error);
    stream.send({ type: "error", message: explainLlmError(error) ?? "Something went wrong while handling that message." });
  } finally {
    stream.end();
  }
};
