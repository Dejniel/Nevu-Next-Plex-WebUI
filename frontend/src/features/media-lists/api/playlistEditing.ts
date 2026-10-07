import type { MediaChange } from "entities/media/model";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { useUserSettings } from "features/settings/model";
import { PlexClient, PlexRequestError } from "shared/api/PlexClient";
import type { MediaListEntry } from "../model/mediaLists";
import { createMediaListSource } from "./mediaLists";

export type PlaylistEntry = Pick<MediaListEntry, "playlistItemID" | "position">;
export type PlaylistEdit =
  | { type: "details"; title: string; summary: string }
  | { type: "delete" }
  | { type: "remove"; entry: PlaylistEntry }
  | { type: "move"; entry: PlaylistEntry; position: number; total: number };

function entryID(entry: PlaylistEntry) {
  if (!entry.playlistItemID || !/^\d+$/.test(entry.playlistItemID))
    throw new Error(
      "This playlist entry has no valid Plex ID. Reopen the playlist.",
    );
  return entry.playlistItemID;
}

/** Plex authorizes playlist access with the active profile's server token. */
export async function editPlaylist(
  id: string,
  edit: PlaylistEdit,
  signal: AbortSignal,
): Promise<MediaChange> {
  if (!/^\d+$/.test(id)) throw new Error("Choose a valid Plex playlist.");
  if (edit.type === "details" && !edit.title.trim())
    throw new Error("Enter a playlist name.");
  const itemID =
    edit.type === "move" || edit.type === "remove"
      ? entryID(edit.entry)
      : undefined;
  if (
    edit.type === "move" &&
    (!Number.isSafeInteger(edit.position) ||
      edit.position < 0 ||
      edit.position >= edit.total ||
      !Number.isSafeInteger(edit.entry.position) ||
      edit.entry.position < 0 ||
      !Number.isSafeInteger(edit.total) ||
      edit.total <= edit.entry.position)
  )
    throw new Error("Choose a position within this playlist.");

  const token = AuthStorage.getServerToken();
  const profileKey = useUserSettings.getState().profileKey;
  const serverId = useServerSession.getState().server?.machineIdentifier;
  const revision = useAuthSession.getState().revision;
  if (!token || !profileKey || !serverId)
    throw new Error("The active Plex session is missing. Sign in again.");
  const assertCurrent = () => {
    signal.throwIfAborted();
    if (
      AuthStorage.getServerToken() !== token ||
      useUserSettings.getState().profileKey !== profileKey ||
      useServerSession.getState().server?.machineIdentifier !== serverId ||
      useAuthSession.getState().revision !== revision ||
      useAuthSession.getState().status !== "ready"
    )
      throw new Error(
        "The active Plex profile changed. Open this action again.",
      );
  };
  assertCurrent();
  const client = new PlexClient(() => token);
  const source = createMediaListSource({ kind: "playlist", id }, signal);
  const path = `/playlists/${id}`;
  const change: MediaChange = {
    serverId,
    profileKey,
    kind: "list",
    listKind: "playlist",
    id,
  };
  try {
    const summary = await source.summary();
    assertCurrent();
    if (!summary) throw new Error("This playlist is no longer available.");
    if (summary.smart && (edit.type === "move" || edit.type === "remove"))
      throw new Error(
        "Smart playlists manage their items through filters in Plex.",
      );
    if (edit.type === "move") {
      const changed = () =>
        new Error(
          "This playlist changed. Close this dialog and select the item again in its current order.",
        );
      if (summary.count !== edit.total) throw changed();
      // Removing the source shifts later positions one place to the left.
      const preceding =
        edit.position > edit.entry.position ? edit.position : edit.position - 1;
      const [current, anchor] = await Promise.all([
        source.page(edit.entry.position, 1),
        edit.position === 0 ? null : source.page(preceding, 1),
      ]);
      assertCurrent();
      const entry = current.items[0];
      const after = anchor?.items[0];
      if (
        (current.total !== null && current.total !== edit.total) ||
        entry?.kind !== "media" ||
        entry.playlistItemID !== itemID ||
        (anchor &&
          ((anchor.total !== null && anchor.total !== edit.total) ||
            after?.kind !== "media" ||
            !after.playlistItemID ||
            after.playlistItemID === itemID))
      )
        throw changed();
      if (edit.position !== edit.entry.position) {
        const params = new URLSearchParams();
        if (after?.kind === "media") params.set("after", entryID(after));
        await client.put(
          `${path}/items/${itemID}/move${params.size ? `?${params}` : ""}`,
          undefined,
          signal,
        );
      }
    } else if (edit.type === "remove") {
      await client.delete(`${path}/items/${itemID}`, signal);
    } else if (edit.type === "delete") {
      await client.delete(path, signal);
    } else {
      const params = new URLSearchParams({
        title: edit.title.trim(),
        summary: edit.summary.trim(),
      });
      await client.put(`${path}?${params}`, undefined, signal);
    }
    assertCurrent();
    return {
      ...change,
      ...(edit.type === "delete" && { effect: "removed" as const }),
    };
  } catch (error) {
    if (error instanceof PlexRequestError) {
      if (error.status === 401 || error.status === 403)
        throw new Error(
          "Plex did not allow editing this playlist for the active profile.",
        );
      if (error.status === 404)
        throw new Error(
          "This playlist or entry is no longer available to the active profile.",
        );
    }
    throw error;
  }
}
