import { useEffect, useRef } from "react";
import { apiUrl } from "../api/client";

/**
 * Listens to the server's background loops (GET /events): due reminders,
 * the evening nudge, and "data changed". EventSource reconnects by itself.
 */
export function useServerEvents(onEvent) {
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    const source = new EventSource(apiUrl("/events"), { withCredentials: true });
    source.onmessage = (message) => {
      try {
        handlerRef.current(JSON.parse(message.data));
      } catch {
        // ignore a malformed event rather than break the stream
      }
    };
    return () => source.close();
  }, []);
}
