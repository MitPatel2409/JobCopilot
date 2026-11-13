import { useState } from "react";

/**
 * For buttons that call the API: `run(fn)` marks the action busy while `fn`
 * runs and hands any error message to `onError`. Resolves to fn's result, or
 * null when it failed.
 */
export function useAction(onError) {
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setBusy(true);
    try {
      return await fn();
    } catch (error) {
      onError?.(error.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { busy, run };
}
