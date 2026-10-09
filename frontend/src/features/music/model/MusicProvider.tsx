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
import { PlexRequestError } from "shared/api/PlexClient";
import {
  mediaMetadataQueryOptions,
  type MediaItemData,
} from "entities/media/model";
import { useLibraries } from "entities/library/model";
import {
  getPlaylistEntry,
  type PlaylistPlaybackContext,
} from "features/media-lists/model";
import { musicAPI, type MusicQueue } from "../api/music";
import {
  musicSessionKey,
  readMusicSession,
  saveMusicSession,
} from "./musicSession";

interface MusicSession {
  queueID: number;
  entryID: number;
  ratingKey: string;
  playing: boolean;
  startTime: number;
}
function useMusicController() {
  const scope = useActiveServerScope();
  const libraries = useLibraries();
  const context = useMemo(() => getXPlexProps(), []);
  const api = useMemo(
    () => musicAPI(context, scope.serverId),
    [context, scope.serverId],
  );
  const storageKey = musicSessionKey(scope);
  const [saved] = useState(() => readMusicSession(storageKey));
  const [session, setSession] = useState<MusicSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(saved.volume);
  const [repeat, setRepeat] = useState(saved.repeat);
  const operation = useRef<AbortController | null>(null);
  const restoring = useRef(Boolean(saved.selection));
  const position = useRef(0);
  const current = useRef({ session, volume, repeat });
  current.current = { session, volume, repeat };
  const queueKey = (id?: number) =>
    ["music-queue", scope.serverId, scope.profileKey, id] as const;
  const queue = useQuery(
    {
      queryKey: queueKey(session?.queueID),
      queryFn: ({ signal }) =>
        api.get(session!.queueID, current.current.session?.entryID, signal),
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

  // All queue work has one owner, including restoration and navigation.
  async function perform(work: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError(null);
    try {
      await work(controller.signal);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Plex could not update the music queue.",
        );
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
      }
    }
  }
  async function publish(result: MusicQueue, signal: AbortSignal) {
    signal.throwIfAborted();
    const key = queueKey(result.id);
    await serverQueryClient.cancelQueries({ queryKey: key });
    signal.throwIfAborted();
    serverQueryClient.setQueryData(key, result);
  }
  function choose(
    result: MusicQueue,
    item: Plex.Metadata,
    playing = true,
    startTime = 0,
  ) {
    position.current = startTime;
    setSession({
      queueID: result.id,
      entryID: item.playQueueItemID!,
      ratingKey: item.ratingKey,
      playing,
      startTime,
    });
  }
  function chooseSelected(result: MusicQueue) {
    const item =
      result.items.find((item) => item.playQueueItemID === result.selected) ??
      result.items[0];
    if (!item) throw new Error("This music selection is empty.");
    choose(result, item);
  }
  function update(
    work: (signal: AbortSignal) => Promise<MusicQueue>,
    select = false,
  ) {
    return perform(async (signal) => {
      const result = await work(signal);
      await publish(result, signal);
      if (select) chooseSelected(result);
    });
  }
  function persist() {
    if (restoring.current || !scope.serverId || !scope.profileKey) return;
    const { session, repeat, volume } = current.current;
    saveMusicSession(storageKey, {
      selection: session
        ? {
            queueID: session.queueID,
            entryID: session.entryID,
            ratingKey: session.ratingKey,
            position: position.current,
          }
        : null,
      repeat,
      volume,
    });
  }
  useEffect(() => {
    if (saved.selection) {
      const selection = saved.selection;
      void perform(async (signal) => {
        try {
          const result = await api.get(
            selection.queueID,
            selection.entryID,
            signal,
          );
          await publish(result, signal);
          const item = result.items.find(
            (item) =>
              item.playQueueItemID === selection.entryID &&
              item.ratingKey === selection.ratingKey,
          );
          if (item) choose(result, item, false, selection.position);
        } catch (reason) {
          if (!(reason instanceof PlexRequestError && reason.status === 404))
            throw reason;
        } finally {
          if (!signal.aborted) restoring.current = false;
        }
      });
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persist();
    };
    const timer = window.setInterval(persist, 5000);
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      persist();
      operation.current?.abort();
      operation.current = null;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // The provider remounts for every server, profile or credential change.
    // oxlint-disable-next-line react/exhaustive-deps
  }, []);
  useEffect(persist, [
    session,
    repeat,
    volume,
    busy,
    storageKey,
    scope.serverId,
    scope.profileKey,
  ]);

  function play(item: MediaItemData, shuffle = false) {
    const source =
      item.type === "track" && item.parentRatingKey
        ? item.parentRatingKey
        : item.ratingKey;
    return update(
      (signal) =>
        api.create(
          { kind: "library", id: source },
          item.type === "track" ? item.ratingKey : undefined,
          shuffle,
          signal,
        ),
      true,
    );
  }
  function playPlaylist(
    context: PlaylistPlaybackContext,
    item: Plex.Metadata,
    shuffle = false,
  ) {
    return update(async (signal) => {
      const entry = await getPlaylistEntry(context, item.ratingKey, signal);
      signal.throwIfAborted();
      if (entry.type !== "track")
        throw new Error("This is not a music playlist.");
      return api.create(
        { kind: "playlist", id: context.id },
        shuffle ? undefined : entry.ratingKey,
        shuffle,
        signal,
      );
    }, true);
  }
  async function select(entryID: number) {
    if (!session || operation.current || !queue.data) return;
    const item = queue.data.items.find(
      (item) => item.playQueueItemID === entryID,
    );
    if (item && entryID !== session.entryID) choose(queue.data, item);
    else if (item) setSession((value) => value && { ...value, playing: true });
  }
  function step(direction: 1 | -1) {
    if (!session) return Promise.resolve();
    return perform(async (signal) => {
      let data = queue.data;
      const neighbor = (data: MusicQueue | undefined) => {
        const index =
          data?.items.findIndex(
            (item) => item.playQueueItemID === session.entryID,
          ) ?? -1;
        return index < 0 ? undefined : data?.items[index + direction];
      };
      if (!neighbor(data)) {
        data = await api.get(session.queueID, session.entryID, signal);
        await publish(data, signal);
      }
      const next = neighbor(data);
      if (next && data) choose(data, next);
      else if (direction === 1 && repeat === "all" && data?.total) {
        // Plex owns the beginning of a potentially much larger queue than this window.
        const reset = await api.reset(session.queueID, signal);
        await publish(reset, signal);
        chooseSelected(reset);
      } else if (direction === 1) {
        setSession((value) => value && { ...value, playing: false });
      }
    });
  }
  function stop() {
    operation.current?.abort();
    operation.current = null;
    restoring.current = false;
    position.current = 0;
    setSession(null);
    setError(null);
    setBusy(false);
  }
  async function reportCurrent(signal: AbortSignal) {
    const active = current.current.session;
    if (!active) return;
    const item =
      track?.ratingKey === active.ratingKey
        ? track
        : queue.data?.items.find(
            (item) => item.playQueueItemID === active.entryID,
          );
    await api.timeline(
      { ratingKey: active.ratingKey, playQueueItemID: active.entryID },
      active.queueID,
      active.playing ? "playing" : "paused",
      position.current,
      (item?.duration ?? 0) / 1000,
      signal,
    );
  }
  return {
    session,
    track,
    queue: queue.data,
    api,
    context,
    volume,
    setVolume,
    repeat,
    setRepeat,
    busy,
    error: error || queue.error?.message || metadata.error?.message,
    setError,
    play,
    playPlaylist,
    select,
    step,
    stop,
    rememberPosition: (entryID: number, seconds: number) => {
      if (
        current.current.session?.entryID === entryID &&
        Number.isFinite(seconds) &&
        seconds >= 0
      )
        position.current = seconds;
    },
    toggle: () =>
      setSession((value) => value && { ...value, playing: !value.playing }),
    pause: () =>
      setSession((value) =>
        value?.playing ? { ...value, playing: false } : value,
      ),
    shuffle: () =>
      session && queue.data
        ? update(async (signal) => {
            await reportCurrent(signal);
            signal.throwIfAborted();
            return api.shuffle(session.queueID, !queue.data!.shuffled, signal);
          })
        : Promise.resolve(),
    add: (item: MediaItemData, next: boolean) =>
      session
        ? update(async (signal) => {
            await reportCurrent(signal);
            signal.throwIfAborted();
            return api.add(
              session.queueID,
              {
                kind: "library",
                id: item.ratingKey,
                libraryUUID: libraries.data?.find(
                  (library) => Number(library.key) === item.librarySectionID,
                )?.uuid,
              },
              next,
              signal,
            );
          })
        : play(item),
    loadWindow: (center: number) =>
      session
        ? update((signal) => api.get(session.queueID, center, signal))
        : Promise.resolve(),
    remove: (entryID: number) =>
      session
        ? perform(async (signal) => {
            if (entryID === session.entryID) {
              await reportCurrent(signal);
              signal.throwIfAborted();
            }
            const result = await api.remove(session.queueID, entryID, signal);
            await publish(result, signal);
            if (!result.total) setSession(null);
            else if (entryID === session.entryID) {
              const next =
                result.items.find(
                  (item) => item.playQueueItemID === result.selected,
                ) ?? result.items[0];
              if (next) choose(result, next, session.playing);
            }
          })
        : Promise.resolve(),
    move: (entryID: number, after?: number) =>
      session
        ? update((signal) => api.move(session.queueID, entryID, after, signal))
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
