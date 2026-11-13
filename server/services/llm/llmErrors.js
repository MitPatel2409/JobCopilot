/**
 * Turns a failed Gemini call into a message the user can act on.
 * Returns null for errors that did not come from the Gemini API.
 */
function explainLlmError(error) {
  switch (error?.status) {
    case 503:
      return "Gemini is overloaded right now (503). Try again in a minute, or set GEMINI_MODEL to a lighter model in server/.env.";
    case 429:
      return "Gemini rate limit reached (429). Wait a minute and try again.";
    case 404:
      return "The Gemini model in GEMINI_MODEL is not available to this API key (404). Pick another model in server/.env.";
    case 400:
    case 401:
    case 403:
      return `Gemini rejected the request (${error.status}). Check GEMINI_API_KEY and GEMINI_MODEL in server/.env.`;
    default:
      break;
  }

  if (error?.name === "TimeoutError" || /timed? ?out|aborted/i.test(error?.message ?? "")) {
    return "Gemini did not answer in time. Try again, or raise GEMINI_TIMEOUT_MS in server/.env.";
  }
  return null;
}

module.exports = { explainLlmError };
