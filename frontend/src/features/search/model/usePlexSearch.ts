import { useEffect, useState } from "react";
import { searchPlex } from "../api/search";

interface SearchState {
  results: Plex.SearchResult[];
  loading: boolean;
  error: string | null;
}

const EMPTY_SEARCH: SearchState = {
  results: [],
  loading: false,
  error: null,
};

export function usePlexSearch(query: string, delay = 500): SearchState {
  const [state, setState] = useState<SearchState>(EMPTY_SEARCH);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setState(EMPTY_SEARCH);
      return;
    }

    let active = true;
    setState({ results: [], loading: true, error: null });
    const timeout = window.setTimeout(async () => {
      try {
        const results = await searchPlex(normalizedQuery);
        if (active) setState({ results, loading: false, error: null });
      } catch {
        if (active)
          setState({
            results: [],
            loading: false,
            error: "Plex search is temporarily unavailable.",
          });
      }
    }, delay);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [delay, query]);

  return state;
}
