import { useCallback, useState } from "react";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** useState that remembers its value in this browser (localStorage). */
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => read(key, typeof initial === "function" ? initial() : initial));

  const set = useCallback(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // private mode or a full disk: keep the value for this visit only
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
