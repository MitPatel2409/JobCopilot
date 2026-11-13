/**
 * Handles one chat message from the user.
 *
 *   1. Build the prompt from the database (snapshot + recent conversation).
 *   2. Let the model call tools until it stops calling them, runs out of
 *      turns, or the request is cancelled.
 *   3. Save both messages, with the tool calls behind the reply, so the
 *      next message sees this exchange.
 *
 * Progress is reported through `onEvent` so the UI can show each action live.
 */
const { createToolbox } = require("./tools");
const { buildSystemPrompt, buildTurnMessage } = require("./prompts");

const HISTORY_MESSAGES = 20;

async function runChat({ ctx, message, maxTurns, onEvent = () => {}, signal }) {
  const history = ctx.store.chat.recent(HISTORY_MESSAGES);
  ctx.store.chat.add({ role: "user", content: message });

  const toolbox = createToolbox(ctx);
  const actions = [];
  const texts = [];
  let turns = 0;
  let stopReason = "max_turns";

  try {
    const session = ctx.llm.startToolSession({ system: buildSystemPrompt(ctx), tools: toolbox.definitions });
    let reply = await session.send({ text: buildTurnMessage(ctx, history, message) });
    turns = 1;

    while (true) {
      if (reply.text) {
        texts.push(reply.text);
        onEvent({ type: "thought", text: reply.text });
      }

      if (reply.toolCalls.length === 0) {
        stopReason = "model_stopped";
        break;
      }

      const toolResults = await runToolCalls(toolbox, reply.toolCalls, actions, onEvent);

      if (signal?.aborted) {
        stopReason = "cancelled";
        break;
      }
      if (turns >= maxTurns) break;

      reply = await session.send({ toolResults });
      turns += 1;
    }
  } catch (error) {
    // Tools that already ran saved their data; keep a record of them in the chat.
    if (actions.length > 0) {
      ctx.store.chat.add({ role: "assistant", content: `${fallbackReply(actions)}\n(Then I hit an error and stopped.)`, actions });
    }
    throw error;
  }

  const content = texts.join("\n\n").trim() || fallbackReply(actions);
  const saved = ctx.store.chat.add({ role: "assistant", content, actions });
  return { reply: content, message: saved, actions, turns, stopReason };
}

/** Runs the tool calls of one model turn in order and reports each one. */
async function runToolCalls(toolbox, toolCalls, actions, onEvent) {
  const results = [];

  for (const call of toolCalls) {
    onEvent({ type: "tool_call", name: call.name, args: call.args });
    const output = await toolbox.execute(call);
    onEvent({ type: "tool_result", name: call.name, args: call.args, output });
    actions.push({ name: call.name, args: call.args, output });
    results.push({ id: call.id, name: call.name, output });
  }

  return results;
}

/** Used when the model ended without saying anything. */
function fallbackReply(actions) {
  const done = actions.filter((action) => action.output?.status !== "error");
  if (done.length === 0) return "Sorry, I didn't catch anything to save. Could you say it another way?";
  return `Done: ${done.map((action) => action.name.replace(/_/g, " ")).join(", ")}.`;
}

module.exports = { runChat, HISTORY_MESSAGES };
