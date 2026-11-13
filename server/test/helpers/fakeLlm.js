/**
 * A stand-in for the Gemini client with the same two methods.
 *
 *   jsonResponses: { [callName]: answer | (args) => answer }  for generateJson
 *   turns:         the model's replies, in order, for the tool session
 *
 * It records what it was sent so tests can assert on it.
 */
function createFakeLlm({ jsonResponses = {}, turns = [] } = {}) {
  const remainingTurns = [...turns];
  const sentToSession = [];
  const jsonCalls = [];

  return {
    sentToSession,
    jsonCalls,

    async generateJson(args) {
      jsonCalls.push(args);
      const answer = jsonResponses[args.name];
      if (answer === undefined) throw new Error(`fake LLM has no answer for "${args.name}"`);
      return typeof answer === "function" ? answer(args) : answer;
    },

    startToolSession() {
      return {
        async send(input) {
          sentToSession.push(input);
          return remainingTurns.shift() ?? { text: "", toolCalls: [] };
        },
      };
    },
  };
}

/** Shorthand for a model turn that makes tool calls. */
function toolTurn(...calls) {
  return {
    text: "",
    toolCalls: calls.map(([name, args], index) => ({ id: `call-${index}`, name, args })),
  };
}

module.exports = { createFakeLlm, toolTurn };
