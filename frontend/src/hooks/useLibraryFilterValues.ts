import React from "react";
import {
  getLibraryFilterValues,
  LibraryFilterValueOption,
} from "../plex/libraryFilters";

type LoadState = "loading" | "loaded" | "error";

export default function useLibraryFilterValues(
  source: Plex.Filter | undefined,
  enabled = true,
) {
  const key = enabled && source ? `${source.key}:${source.filter}` : "";
  const [attempt, retry] = React.useReducer((value) => value + 1, 0);
  const [result, setResult] = React.useState<{
    key: string;
    state: LoadState;
    options: LibraryFilterValueOption[];
  }>({ key: "", state: "loaded", options: [] });

  React.useEffect(() => {
    if (!key || !source) return;
    let current = true;
    setResult({ key, state: "loading", options: [] });
    getLibraryFilterValues(source)
      .then((options) => current && setResult({ key, state: "loaded", options }))
      .catch(() => current && setResult({ key, state: "error", options: [] }));
    return () => { current = false; };
  }, [attempt, key, source]);

  const current = result.key === key;
  return {
    options: current ? result.options : [],
    loading: Boolean(key) && (!current || result.state === "loading"),
    error: current && result.state === "error",
    retry,
  };
}
