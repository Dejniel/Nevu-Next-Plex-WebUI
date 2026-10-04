import { useEffect, useMemo, useState } from "react";
import { subscribeToLibraryCache } from "shared/lib/libraryCache";
import { getLocalMediaMatches } from "../api/mediaAvailability";
import {
  indexMediaAvailability,
  type MediaAvailability,
} from "./mediaAvailability";

const empty = new Map<string, MediaAvailability>();

export function useMediaAvailability(
  guids: readonly string[],
  profileKey: string | null,
) {
  const key = JSON.stringify([...new Set(guids)].sort());
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    key: "",
    profileKey,
    items: empty,
    loading: false,
    error: null as string | null,
  });
  useEffect(
    () => subscribeToLibraryCache(() => setRevision((value) => value + 1)),
    [],
  );
  const requested = useMemo<string[]>(() => JSON.parse(key), [key]);

  useEffect(() => {
    const controller = new AbortController();
    setState({
      key,
      profileKey,
      items: empty,
      loading: requested.length > 0 && Boolean(profileKey),
      error: null,
    });
    if (!requested.length || !profileKey) return () => controller.abort();
    void getLocalMediaMatches(requested, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted)
          setState({
            key,
            profileKey,
            items: indexMediaAvailability(items),
            loading: false,
            error: null,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            key,
            profileKey,
            items: empty,
            loading: false,
            error: "Could not check which titles are available on this server.",
          });
      });
    return () => controller.abort();
  }, [key, profileKey, requested, revision]);

  const current = state.key === key && state.profileKey === profileKey;
  return {
    items: current ? state.items : empty,
    loading: !current || state.loading,
    error: current ? state.error : null,
    retry: () => setRevision((value) => value + 1),
  };
}
