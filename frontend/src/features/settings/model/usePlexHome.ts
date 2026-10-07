import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AuthStorage,
  changePlexHome,
  getPlexHomeOverview,
  useAuthSession,
} from "features/session/model";
import type { PlexHomeChange } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";

export function usePlexHome() {
  const { activeProfile, revision, status, updateHomeProfiles } =
    useAuthSession();
  const token = AuthStorage.getProfileAccountToken() || "";
  const session = useMemo(
    () => ({
      token,
      activeId: activeProfile?.id || 0,
    }),
    [activeProfile?.id, token],
  );
  const queryKey = useMemo(
    () => ["plex-home", revision, session.activeId],
    [revision, session.activeId],
  );
  const query = useQuery(
    {
      queryKey,
      enabled: status === "ready" && Boolean(session.token),
      queryFn: ({ signal }) => getPlexHomeOverview(session, signal),
    },
    serverQueryClient,
  );
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPending(false);
    setError(null);
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [revision, session.activeId]);
  useEffect(() => {
    if (query.data) updateHomeProfiles(query.data.members, revision);
  }, [query.data, revision, updateHomeProfiles]);

  const change = async (input: PlexHomeChange) => {
    if (!query.data || controller.current) return false;
    const operation = new AbortController();
    controller.current = operation;
    setPending(true);
    setError(null);
    const sameSession = () =>
      useAuthSession.getState().status === "ready" &&
      useAuthSession.getState().revision === revision &&
      AuthStorage.getProfileAccountToken() === session.token;
    const current = () => !operation.signal.aborted && sameSession();
    let saved = false;
    try {
      await changePlexHome(session, query.data, input, operation.signal);
      saved = true;
    } catch (failure) {
      if (current())
        setError(
          failure instanceof Error
            ? failure.message
            : "Plex Home could not save this change.",
        );
    } finally {
      if (sameSession()) {
        // A timed-out write may still have reached Plex. Re-read its authoritative state.
        await serverQueryClient.invalidateQueries({ queryKey, exact: true });
      }
      if (controller.current === operation) controller.current = null;
      if (current()) setPending(false);
    }
    return saved && current();
  };
  // PINs stay in the open dialog and its request, never Query's mutation cache.
  return {
    ...query,
    change,
    pending,
    mutationError: error,
    clearError: () => setError(null),
  };
}
