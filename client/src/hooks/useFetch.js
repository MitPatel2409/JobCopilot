import { useEffect, useReducer, useState } from "react";
import { getJson } from "../api/client";

/**
 * Loads `path` and loads it again whenever `refreshKey` changes (the app
 * bumps it after each chat reply or background event) or `reload` is called.
 * Pass a null path to load nothing.
 */
export function useFetch(path, refreshKey) {
  const [state, setState] = useState({ path: null, data: null, error: null });
  const [localKey, reload] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;

    getJson(path).then(
      (data) => {
        if (!cancelled) setState({ path, data, error: null });
      },
      (error) => {
        if (!cancelled) setState((previous) => ({ path, data: previous.path === path ? previous.data : null, error: error.message }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, refreshKey, localKey]);

  const current = state.path === path;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !current,
    reload,
  };
}
