import { useState } from "react";
import { sendJson } from "../api/client";

/**
 * Sends a form to the API. `submit(path, body)` resolves to the response, or
 * to null after putting the server's message in `error`.
 */
export function useSubmit() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(path, body) {
    setSaving(true);
    setError(null);
    try {
      return await sendJson(path, "POST", body);
    } catch (submitError) {
      setError(submitError.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  return { saving, error, submit };
}
