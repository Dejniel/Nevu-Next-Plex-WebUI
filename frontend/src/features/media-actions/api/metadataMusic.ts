import { readMediaMetadata, type MediaMetadata } from "entities/media/model";
import { libraryItemTypeNumbers } from "@nevu/contracts";
import { PlexClient } from "shared/api/PlexClient";
import { readPlexMetadataPages } from "shared/api/plexPagination";
import {
  plexArray,
  plexContainer,
  PlexResponseError,
} from "shared/api/plexResponse";
import type {
  MetadataEditingItem,
  MetadataMusicParents,
  MetadataUpdate,
} from "../model/metadataEditing";

async function readItem(client: PlexClient, id: string, signal: AbortSignal) {
  if (!/^\d+$/.test(id)) throw new Error("Choose an existing library item.");
  const container = plexContainer(
    await client.get(`/library/metadata/${id}`, signal),
    "music metadata",
  );
  const rows = plexArray(container.Metadata, "music metadata");
  if (rows.length !== 1) throw new PlexResponseError("music metadata");
  return readMediaMetadata(rows[0], id);
}

/** Validate relationships and resolve Plex's native rename/merge destination before writes. */
export async function prepareMusicEdit(
  client: PlexClient,
  data: MetadataEditingItem,
  changes: MetadataUpdate,
  parents: MetadataMusicParents,
  signal: AbortSignal,
): Promise<{
  data: MetadataEditingItem;
  parents: MetadataMusicParents;
  destination?: MediaMetadata;
}> {
  if (!["artist", "album", "track"].includes(data.type))
    throw new Error("This item has no editable music parents.");
  const current = await readItem(client, data.ratingKey, signal);
  if (
    current.type !== data.type ||
    current.librarySectionID !== data.librarySectionID
  )
    throw new Error("This music item has changed. Open its editor again.");
  const artistID =
    parents.artist?.id ??
    (current.type === "album"
      ? current.parentRatingKey
      : current.grandparentRatingKey);
  const verified: MetadataMusicParents = {};
  if (current.type === "artist" && Object.keys(parents).length)
    throw new Error("An artist has no music parents.");
  if (parents.artist) {
    const artist = await readItem(client, parents.artist.id, signal);
    assertParent(artist, "artist", current.librarySectionID);
    verified.artist = { id: artist.ratingKey, title: artist.title };
  }
  if (current.type === "track" && (parents.artist || parents.album)) {
    if (!parents.album || !artistID)
      throw new Error("Choose an album for the selected artist.");
    const album = await readItem(client, parents.album.id, signal);
    assertParent(album, "album", current.librarySectionID);
    if (album.parentRatingKey !== artistID)
      throw new Error("Choose an album belonging to the selected artist.");
    verified.album = { id: album.ratingKey, title: album.title };
    verified.artist = {
      id: artistID,
      title: parents.artist?.title ?? current.grandparentTitle ?? "",
    };
  } else if (current.type === "album" && parents.album)
    throw new Error("An album can only change its artist.");
  let destination: MediaMetadata | undefined;
  if (
    (current.type === "album" || current.type === "artist") &&
    (changes.title !== undefined || verified.artist)
  ) {
    if (current.type === "album" && !artistID)
      throw new Error("Plex could not identify this album's artist.");
    const title = changes.title ?? current.title;
    const params = new URLSearchParams({
      type: String(libraryItemTypeNumbers[current.type]),
      title,
    });
    if (current.type === "album") params.set("artist.id", artistID!);
    const items = await readPlexMetadataPages({
      resource: "matching music items",
      pageSize: 100,
      signal,
      readItem: (value) => readMediaMetadata(value),
      identity: (item) => item.ratingKey,
      fetchPage: (offset) =>
        client.get(
          `/library/sections/${data.librarySectionID}/all?${params}&X-Plex-Container-Start=${offset}&X-Plex-Container-Size=100`,
          signal,
        ),
    });
    const matches = items.filter(
      (item) =>
        item.type === current.type &&
        (item.type !== "album" || item.parentRatingKey === artistID) &&
        item.title.trim().toLowerCase() === title.trim().toLowerCase() &&
        item.ratingKey !== data.ratingKey,
    );
    if (matches.length > 1)
      throw new Error(
        "Plex has several matching items. Resolve the duplicates before saving.",
      );
    if (matches[0])
      destination = {
        ...matches[0],
        librarySectionID: current.librarySectionID,
      };
  }
  return { data: current, parents: verified, destination };
}

function assertParent(
  item: MediaMetadata,
  type: "artist" | "album",
  section: number | undefined,
) {
  if (item.type !== type || item.librarySectionID !== section)
    throw new Error("Choose an existing artist or album in this library.");
}
