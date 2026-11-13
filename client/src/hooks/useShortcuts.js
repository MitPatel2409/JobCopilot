import { useEffect, useRef } from "react";

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * Keyboard shortcuts for the whole page. `shortcuts` maps a key to a handler:
 * "mod+k" is Ctrl+K (Cmd+K on a Mac) and works everywhere; single keys such
 * as "n" or "/" are skipped while the user types or a dialog is open.
 */
export function useShortcuts(shortcuts) {
  const ref = useRef(shortcuts);
  useEffect(() => {
    ref.current = shortcuts;
  });

  useEffect(() => {
    function onKey(event) {
      if (event.defaultPrevented) return;

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const handler = ref.current[`mod+${event.key.toLowerCase()}`];
        if (handler) {
          event.preventDefault();
          handler();
        }
        return;
      }
      if (event.altKey || isTyping(event.target) || document.querySelector('[role="dialog"]')) return;

      const handler = ref.current[event.key];
      if (handler) {
        event.preventDefault();
        handler();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
