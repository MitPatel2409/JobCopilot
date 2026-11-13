import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, streamChat } from "../api/client";

/**
 * The conversation with the assistant. While a reply is being worked on,
 * `pending.actions` fills up live as each tool finishes.
 */
export function useChat({ onFinished }) {
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const loadHistory = useCallback(() => {
    getJson("/chat/history").then(
      (data) => setMessages(data.messages),
      (loadError) => setError(loadError.message),
    );
  }, []);

  useEffect(loadHistory, [loadHistory]);

  async function send(text) {
    const message = text.trim();
    if (!message || pending) return;

    setError(null);
    setMessages((current) => [...current, { id: `local-${Date.now()}`, role: "user", content: message, actions: [] }]);
    setPending({ actions: [] });

    const controller = new AbortController();
    abortRef.current = controller;
    let failed = false;

    try {
      await streamChat({
        message,
        signal: controller.signal,
        onEvent(event) {
          if (event.type === "tool_result") {
            const action = { name: event.name, args: event.args, output: event.output };
            setPending((current) => current && { actions: [...current.actions, action] });
          } else if (event.type === "done") {
            setMessages((current) => [...current, event.message]);
          } else if (event.type === "error") {
            failed = true;
            setError(event.message);
          }
        },
      });
    } catch (sendError) {
      failed = true;
      if (sendError.name !== "AbortError") setError(sendError.message);
    } finally {
      abortRef.current = null;
      setPending(null);
      // On failure the server may still have saved part of the work; show its record of it.
      if (failed) loadHistory();
      onFinished?.();
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return { messages, pending, error, send, stop, dismissError: () => setError(null) };
}
