import { useEffect, useSyncExternalStore } from "react";
import { useStoredState } from "./useStoredState";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Light or dark. Follows the system setting until the user picks one; the
 * choice is saved under "jc-theme" (index.html reads it before first paint).
 */
export function useTheme() {
  const [choice, setChoice] = useStoredState("jc-theme", null);
  const systemDark = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
  const dark = choice ? choice === "dark" : systemDark;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return { dark, toggle: () => setChoice(dark ? "light" : "dark") };
}
