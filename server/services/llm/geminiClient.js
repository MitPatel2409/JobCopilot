/**
 * Thin wrapper around the Gemini SDK.
 *
 * The rest of the app only uses the two methods returned here, so no other
 * module depends on Gemini's request shapes. Tests replace this object with
 * a fake that has the same two methods.
 */
const { GoogleGenAI } = require("@google/genai");

// The SDK's default is 5 attempts with up to 60 s between them, so one
// overloaded call could hang for minutes. Fail fast and tell the user instead.
const RETRY_OPTIONS = { attempts: 3, initialDelay: 1, maxDelay: 4 };

function createGeminiClient({ apiKey, model, timeoutMs }) {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: timeoutMs, retryOptions: RETRY_OPTIONS },
  });

  /**
   * One-shot call whose answer must be JSON matching `schema`.
   * `name` only labels errors so a failure says which call broke.
   */
  async function generateJson({ name, system, prompt, schema }) {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });

    const text = extractText(response);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${name}: model did not return valid JSON`);
    }
  }

  /**
   * Starts a multi-turn conversation in which the model may call tools.
   *
   * The session keeps the full history itself (including Gemini's hidden
   * "thought signatures", which must be sent back unchanged), so each call
   * to `send` only passes the new input: either `{ text }` or `{ toolResults }`.
   */
  function startToolSession({ system, tools }) {
    const history = [];
    const config = {
      systemInstruction: system,
      tools: [{ functionDeclarations: tools.map(toFunctionDeclaration) }],
    };

    async function send({ text, toolResults }) {
      history.push(text !== undefined ? userTextMessage(text) : toolResultsMessage(toolResults));

      const response = await ai.models.generateContent({ model, contents: history, config });

      const modelMessage = response.candidates?.[0]?.content;
      if (modelMessage) history.push(modelMessage);

      return {
        text: extractText(response),
        toolCalls: (response.functionCalls ?? []).map((call) => ({
          id: call.id,
          name: call.name,
          args: call.args ?? {},
        })),
      };
    }

    return { send };
  }

  return { generateJson, startToolSession };
}

// ---------------------------------------------------------------------------
// Gemini message helpers
// ---------------------------------------------------------------------------

function toFunctionDeclaration(tool) {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  };
}

function userTextMessage(text) {
  return { role: "user", parts: [{ text }] };
}

function toolResultsMessage(results) {
  return {
    role: "user",
    parts: results.map((result) => ({
      functionResponse: { id: result.id, name: result.name, response: { result: result.output } },
    })),
  };
}

/** Joins the visible text parts, skipping tool calls and internal "thought" parts. */
function extractText(response) {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => typeof part.text === "string" && !part.thought)
    .map((part) => part.text)
    .join("")
    .trim();
}

module.exports = { createGeminiClient };
