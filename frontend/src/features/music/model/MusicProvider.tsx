import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getXPlexProps,
  useActiveServerScope,
  useAuthSession,
} from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  mediaMetadataQueryOptions,
  type MediaItemData,
} from "entities/media/model";
import { useLibraries } from "entities/library/model";
import { musicAPI, type MusicQueue } from "../api/music";

interface MusicSession {
  queueID: number;
  entryID: number;
  ratingKey: string;
  playing: boolean;
}
function useMusicController() {
  const scope = useActiveServerScope();
  const libraries = useLibraries();
  const api = useMemo(
    () => musicAPI(getXPlexProps(), scope.serverId),
    [scope.serverId],
  );
  const [session, setSession] = useState<MusicSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const generation = useRef(0);
  const pending = useRef(false);
  const current = useRef(session);
  current.current = session;
  const key = [
    "music-queue",
    scope.serverId,
    scope.profileKey,
    session?.queueID,
  ] as const;
  const queue = useQuery(
    {
      queryKey: key,
      queryFn: ({ signal }) =>
        api.get(session!.queueID, current.current?.entryID, signal),
      enabled: Boolean(session),
      staleTime: 60_000,
      refetchInterval: session ? 60_000 : false,
    },
    serverQueryClient,
  );
  const metadata = useQuery(
    {
      ...mediaMetadataQueryOptions(scope, session?.ratingKey ?? ""),
      enabled: Boolean(session),
    },
    serverQueryClient,
  );
  const track = metadata.data ?? null;
  useEffect(
    () => () => {
      ++generation.current;
    },
    [],
  );

  async function perform(operation: () => Promise<MusicQueue>, select = false) {
    if (pending.current) return;
    pending.current = true;
    const revision = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (generation.current !== revision) return;
      const resultKey = [
        "music-queue",
        scope.serverId,
        scope.profileKey,
        result.id,
      ];
      await serverQueryClient.cancelQueries({ queryKey: resultKey });
      if (generation.current !== revision) return;
      serverQueryClient.setQueryData(resultKey, result);
      if (select) {
        const item =
          result.items.find(
            (item) => item.playQueueItemID === result.selected,
          ) ?? result.items[0];
        if (!item) throw new Error("This music selection is empty.");
        setSession({
          queueID: result.id,
          entryID: item.playQueueItemID!,
          ratingKey: item.ratingKey,
          playing: true,
        });
      }
    } catch (reason) {
      if (generation.current === revision)
        setError(
          reason instanceof Error
            ? reason.message
            : "Plex could not update the music queue.",
        );
    } finally {
      pending.current = false;
      if (generation.current === revision) setBusy(false);
    }
  }
  function play(item: MediaItemData, shuffle = false) {
    const source =
      item.type === "track" && item.parentRatingKey
        ? item.parentRatingKey
        : item.ratingKey;
    return perform(
      () =>
        api.create(
          source,
          item.type === "track" ? item.ratingKey : undefined,
          shuffle,
        ),
      true,
    );
  }
  async function select(entryID: number) {
    if (!session || pending.current) return;
    const item = queue.data?.items.find(
      (item) => item.playQueueItemID === entryID,
    );
    if (item)
      setSession(
        (value) =>
          value && {
            ...value,
            entryID,
            ratingKey: item.ratingKey,
            playing: true,
          },
      );
  }
  async function step(direction: number) {
    if (!session || pending.current) return;
    const revision = ++generation.current;
    pending.current = true;
    setBusy(true);
    try {
      let data = queue.data;
      let index =
        data?.items.findIndex(
          (item) => item.playQueueItemID === session.entryID,
        ) ?? -1;
      if (!data?.items[index + direction]) {
        data = await api.get(session.queueID, session.entryID);
        if (generation.current !== revision) return;
        serverQueryClient.setQueryData(key, data);
        index = data.items.findIndex(
          (item) => item.playQueueItemID === session.entryID,
        );
      }
      const next = data?.items[index + direction];
      if (next?.playQueueItemID)
        setSession(
          (value) =>
            value && {
              ...value,
              entryID: next.playQueueItemID!,
              ratingKey: next.ratingKey,
              playing: true,
            },
        );
      else setSession((value) => value && { ...value, playing: false });
    } catch {
      if (generation.current === revision)
        setError("Plex could not load the next track.");
    } finally {
      pending.current = false;
      if (generation.current === revision) setBusy(false);
    }
  }
  function stop() {
    ++generation.current;
    setSession(null);
    setError(null);
    setBusy(false);
  }
  return {
    session,
    track,
    queue: queue.data,
    api,
    context: getXPlexProps(),
    volume,
    setVolume,
    busy,
    error: error || queue.error?.message || metadata.error?.message,
    setError,
    play,
    select,
    step,
    stop,
    toggle: () =>
      setSession((value) => value && { ...value, playing: !value.playing }),
    pause: () =>
      setSession((value) =>
        value?.playing ? { ...value, playing: false } : value,
      ),
    add: (item: MediaItemData, next: boolean) =>
      session
        ? perform(() =>
            api.add(
              session.queueID,
              item.ratingKey,
              next,
              libraries.data?.find(
                (library) => Number(library.key) === item.librarySectionID,
              )?.uuid,
            ),
          )
        : play(item),
    loadWindow: (center: number) =>
      session
        ? perform(() => api.get(session.queueID, center))
        : Promise.resolve(),
    remove: (entryID: number) =>
      session
        ? perform(() => api.remove(session.queueID, entryID))
        : Promise.resolve(),
    move: (entryID: number, after?: number) =>
      session
        ? perform(() => api.move(session.queueID, entryID, after))
        : Promise.resolve(),
  };
}
const MusicContext = createContext<ReturnType<
  typeof useMusicController
> | null>(null);
export function MusicProvider({ children }: { children: React.ReactNode }) {
  const scope = useActiveServerScope();
  const revision = useAuthSession((state) => state.revision);
  return (
    <ScopedMusicProvider
      key={`${scope.serverId}/${scope.profileKey}/${revision}`}
    >
      {children}
    </ScopedMusicProvider>
  );
}
function ScopedMusicProvider({ children }: { children: React.ReactNode }) {
  const controller = useMusicController();
  return <MusicContext value={controller}>{children}</MusicContext>;
}
export function useMusic() {
  const value = useContext(MusicContext);
  if (!value) throw new Error("Music controls require MusicProvider.");
  return value;
}
