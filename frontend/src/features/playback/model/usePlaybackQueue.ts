import { useEffect, useState } from "react";
import {
  getPlaylistQueue,
  type PlaylistPlaybackContext,
} from "features/media-lists/model";
import { useUserSettings } from "features/settings/model";
import { getPlaybackQueueForItem } from "../api/playback";

export function usePlaybackQueue(
  metadata: Plex.Metadata | null,
  playlist?: PlaylistPlaybackContext,
) {
  const profileKey = useUserSettings((state) => state.profileKey);
  const key = JSON.stringify([
    profileKey,
    metadata?.ratingKey,
    playlist?.id,
    playlist?.index,
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
    if (!metadata) return;
    const request = playlist
      ? getPlaylistQueue(playlist, metadata.ratingKey)
      : getPlaybackQueueForItem(metadata);
    void request
      .then((queue) => {
        if (alive) setState({ key, queue, error: null });
      })
      .catch((error) => {
        if (alive)
          setState({
            key,
            queue: null,
            error: playlist
              ? error instanceof Error
                ? error.message
                : "Plex could not load the playlist order."
              : null,
          });
      });
    return () => {
      alive = false;
    };
    // The serialized key covers playlist identity without depending on a new object on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, metadata, revision]);

  return {
    playQueue: state.key === key ? state.queue : null,
    queueError: state.key === key ? state.error : null,
    reloadQueue: () => setRevision((value) => value + 1),
  };
}
