/**
 * The shared LLM client used by the running server.
 * index.js checks that GEMINI_API_KEY is set before this module is loaded.
 */
const config = require("../../config/env");
const { createGeminiClient } = require("./geminiClient");

module.exports = createGeminiClient({
  apiKey: config.geminiApiKey,
  model: config.geminiModel,
  timeoutMs: config.geminiTimeoutMs,
});
