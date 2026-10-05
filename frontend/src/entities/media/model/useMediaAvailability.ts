import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeToLibraryCache } from "shared/lib/libraryCache";
import { useAutoRefresh } from "shared/lib/useAutoRefresh";
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
  const requested = useMemo<string[]>(() => JSON.parse(key), [key]);
  const request = useRef<() => Promise<void>>(async () => undefined);
  const [state, setState] = useState({
    profileKey,
    items: empty,
    ready: false,
    loading: Boolean(profileKey && requested.length),
    error: null as string | null,
  });

  useEffect(() => {
    let active = true;
    let pending: Promise<void> | null = null;
    const controller = new AbortController();
    const refresh = () => {
      if (pending) return pending;
      if (!profileKey || !requested.length) {
        setState({
          profileKey,
          items: empty,
          ready: true,
          loading: false,
          error: null,
        });
        return Promise.resolve();
      }
      setState((previous) => ({
        ...previous,
        profileKey,
        items: previous.profileKey === profileKey ? previous.items : empty,
        ready: previous.profileKey === profileKey && previous.ready,
        loading: !(previous.profileKey === profileKey && previous.ready),
        error: null,
      }));
      pending = getLocalMediaMatches(requested, controller.signal)
        .then((items) => {
          if (active)
            setState({
              profileKey,
              items: indexMediaAvailability(items),
              ready: true,
              loading: false,
              error: null,
            });
        })
        .catch(() => {
          if (active)
            setState((previous) => ({
              ...previous,
              loading: false,
              error:
                "Could not check which titles are available on this server.",
            }));
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    };
    request.current = refresh;
    void refresh();
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, profileKey, requested]);

  const refresh = useAutoRefresh(
    profileKey && requested.length ? `${profileKey}:${key}` : null,
    () => request.current(),
  );
  useEffect(
    () =>
      subscribeToLibraryCache((action, scope) => {
        if (
          action === "invalidate" &&
          (!scope?.profileKey || scope.profileKey === profileKey)
        )
          refresh.current?.invalidate();
      }),
    [profileKey, refresh],
  );
  const retry = useCallback(() => {
    void refresh.current?.refresh();
  }, [refresh]);
  const current = state.profileKey === profileKey;
  return {
    items: current ? state.items : empty,
    loading: current ? state.loading : Boolean(profileKey && requested.length),
    error: current ? state.error : null,
    retry,
  };
}
