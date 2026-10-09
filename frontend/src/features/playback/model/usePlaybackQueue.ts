import { useEffect, useState } from "react";
import {
  getPlaylistQueue,
  type PlaylistPlaybackContext,
} from "features/media-lists/model";
import { useActiveServerScope } from "features/session/model";
import { getPlaybackQueueForItem } from "../api/playback";

export function usePlaybackQueue(
  metadata: Plex.Metadata | null,
  playlist?: PlaylistPlaybackContext,
) {
  const { serverId, profileKey } = useActiveServerScope();
  const ratingKey = metadata?.ratingKey;
  const key = JSON.stringify([
    serverId,
    profileKey,
    ratingKey,
    playlist?.id,
    playlist?.index,
    playlist?.itemID,
  ]);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    queue: Plex.Metadata[] | null;
    error: string | null;
  }>({ key, queue: null, error: null });

  useEffect(() => {
    let alive = true;
    setState({ key, queue: null, error: null });
    if (!ratingKey || !serverId || !profileKey) return;
    const controller = new AbortController();
    const request = playlist
      ? getPlaylistQueue(playlist, ratingKey, controller.signal)
      : getPlaybackQueueForItem(ratingKey, controller.signal);
    void request
      .then((queue) => {
        if (alive) setState({ key, queue, error: null });
      })
      .catch((error) => {
        if (alive)
          setState({
            key,
            queue: null,
            error: error instanceof Error
              ? error.message
              : playlist
                ? "Plex could not load the playlist order."
                : "Plex could not load the playback queue.",
          });
      });
    return () => {
      alive = false;
      controller.abort();
    };
    // The serialized key covers playlist identity without depending on a new object on each render.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [key, ratingKey, serverId, profileKey, revision]);

  return {
    playQueue: state.key === key ? state.queue : null,
    queueError: state.key === key ? state.error : null,
    reloadQueue: () => setRevision((value) => value + 1),
  };
}
