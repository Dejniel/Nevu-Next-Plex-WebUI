import { readMediaMetadata } from "entities/media/model";
import { readPlexMetadataPage } from "shared/api/plexPagination";
import {
  PlexResponseError,
  plexBoolean,
  plexFields,
  plexInteger,
  plexObject,
  plexString,
} from "shared/api/plexResponse";
import type {
  MediaListEntry,
  MediaListKind,
  MediaListSummary,
  PlaylistType,
} from "../model/mediaLists";

const resource = "media list data";
const text = (value: unknown) => plexString(value, resource);
const integer = (value: unknown) => plexInteger(value, resource);
function identity(value: unknown) {
  const id = text(value);
  if (!id.trim()) throw new PlexResponseError(resource);
  return id;
}
function playlistType(value: unknown): PlaylistType {
  if (value !== "video" && value !== "audio" && value !== "photo")
    throw new PlexResponseError(resource);
  return value;
}

export function readListSummary(
  value: unknown,
  kind: MediaListKind,
  section?: number,
): MediaListSummary {
  const row = plexObject(value, resource);
  const id = identity(row.ratingKey);
  if (row.type !== kind || !/^\d+$/.test(id))
    throw new PlexResponseError(resource);
  const fields = plexFields(row, {
    summary: text,
    thumb: text,
    composite: text,
    art: text,
    childCount: integer,
    leafCount: integer,
    smart: (value) => plexBoolean(value, resource),
    librarySectionID: integer,
    subtype: text,
  });
  const libraryID = fields.librarySectionID ?? section;
  return {
    kind,
    id,
    title: text(row.title),
    summary: fields.summary ?? "",
    image: fields.thumb || fields.composite || fields.art,
    count: fields.childCount ?? fields.leafCount ?? 0,
    smart: fields.smart ?? false,
    libraryID: libraryID === undefined ? undefined : String(libraryID),
    itemType: fields.subtype,
    ...(kind === "playlist" && {
      playlistType: playlistType(row.playlistType),
    }),
  };
}

export function readSingleList(
  value: unknown,
  kind: MediaListKind,
  expectedID?: string,
) {
  const { container, rows } = readPlexMetadataPage(value, resource, 0, 1);
  if (rows.length !== 1) throw new PlexResponseError(resource);
  const section = plexFields(container, {
    librarySectionID: integer,
  }).librarySectionID;
  const result = readListSummary(rows[0], kind, section);
  if (expectedID !== undefined && result.id !== expectedID)
    throw new PlexResponseError(resource);
  return result;
}

export function readListEntry(
  value: unknown,
  position: number,
  kind: MediaListKind,
  section?: number,
  localServer?: string,
): MediaListEntry {
  const row = plexObject(value, resource);
  const item = {
    ratingKey: identity(row.ratingKey),
    type: identity(row.type),
    title: text(row.title),
  };
  const fields = plexFields(row, {
    playlistItemID: (value) => {
      const id = integer(value);
      if (id === 0) throw new PlexResponseError(resource);
      return id;
    },
    sourceURI: text,
    librarySectionID: integer,
  });
  const sourceServer = fields.sourceURI?.match(/^server:\/\/([^/]+)\//)?.[1];
  const occurrence = {
    kind: "media" as const,
    position,
    playlistItemID:
      fields.playlistItemID === undefined
        ? undefined
        : String(fields.playlistItemID),
  };
  if (
    !(
      kind === "playlist"
        ? ["movie", "show", "episode", "track", "photo"]
        : ["movie", "show", "episode"]
    ).includes(item.type) ||
    !/^\d+$/.test(item.ratingKey) ||
    (fields.sourceURI !== undefined &&
      (!sourceServer || sourceServer !== localServer))
  )
    return { ...occurrence, supported: false, item };
  const librarySectionID = fields.librarySectionID ?? section;
  return {
    ...occurrence,
    supported: true,
    item: readMediaMetadata({ ...row, librarySectionID }),
  };
}
