import {
  PlexResponseError,
  plexObject,
  plexContainer,
  plexArray,
  plexString,
  plexNumber,
  plexInteger,
  plexBoolean,
  plexFields,
} from "shared/api/plexResponse";
import type { MediaMetadata, MediaStream } from "plex/media";
import { normalizeLibraryRecord } from "@nevu/contracts";

const resource = "media metadata";
const text = (value: unknown) => plexString(value, resource);
const number = (value: unknown) => plexNumber(value, resource);
const integer = (value: unknown) => plexInteger(value, resource);
const flag = (value: unknown) => plexBoolean(value, resource);
const object = (value: unknown) => plexObject(value, resource);
const array =
  <T>(read: (value: unknown) => T) =>
  (value: unknown) =>
    plexArray(value, resource).map((entry) => read(entry));
function identity(value: unknown) {
  const id = text(value);
  if (!id.trim()) throw new PlexResponseError(resource);
  return id;
}

function readStream(value: unknown): MediaStream {
  const row = object(value);
  const streamType = row.streamType;
  if (streamType !== 1 && streamType !== 2 && streamType !== 3)
    throw new PlexResponseError(resource);
  return {
    streamType,
    ...plexFields(row, {
      id: integer,
      index: integer,
      codec: text,
      default: flag,
      selected: flag,
      bitrate: integer,
      language: text,
      languageTag: text,
      languageCode: text,
      bitDepth: integer,
      chromaLocation: text,
      chromaSubsampling: text,
      codedHeight: integer,
      codedWidth: integer,
      // Native JSON uses a number; XML-derived responses may use a decimal string.
      frameRate: (value) => {
        const rate =
          typeof value === "string" && /^\d+(\.\d+)?$/.test(value)
            ? Number(value)
            : number(value);
        if (rate <= 0) throw new PlexResponseError(resource);
        return rate;
      },
      height: integer,
      level: integer,
      profile: text,
      refFrames: integer,
      scanType: text,
      title: text,
      width: integer,
      displayTitle: text,
      extendedDisplayTitle: text,
      channels: integer,
      audioChannelLayout: text,
      samplingRate: integer,
    }),
  };
}

function readPart(value: unknown) {
  return plexFields(object(value), {
    id: integer,
    key: identity,
    duration: integer,
    file: text,
    size: integer,
    audioProfile: text,
    container: text,
    indexes: text,
    videoProfile: text,
    Stream: array(readStream),
  });
}

function readRendition(value: unknown) {
  return plexFields(object(value), {
    id: integer,
    duration: integer,
    bitrate: integer,
    width: integer,
    height: integer,
    aspectRatio: number,
    audioChannels: integer,
    audioCodec: text,
    videoCodec: text,
    videoResolution: text,
    container: text,
    videoFrameRate: text,
    audioProfile: text,
    videoProfile: text,
    videoDynamicRange: text,
    aperture: text,
    exposure: text,
    iso: (value) =>
      integer(
        typeof value === "string" && /^\d+$/.test(value)
          ? Number(value)
          : value,
      ),
    lens: text,
    make: text,
    model: text,
    Part: array(readPart),
  });
}

function readTag(value: unknown) {
  const row = object(value);
  return {
    tag: text(row.tag),
    ...plexFields(row, { id: integer, filter: text }),
  };
}
function readRole(value: unknown) {
  const row = object(value);
  return {
    ...readTag(row),
    ...plexFields(row, { role: text, tagKey: text, thumb: text }),
  };
}
function readChildren(value: unknown) {
  return plexFields(object(value), {
    size: integer,
    Metadata: array(readMediaMetadata),
  });
}
function readOffsets(row: Record<string, unknown>) {
  const startTimeOffset = integer(row.startTimeOffset);
  const endTimeOffset = integer(row.endTimeOffset);
  if (endTimeOffset < startTimeOffset) throw new PlexResponseError(resource);
  return { startTimeOffset, endTimeOffset };
}

/** One decoder for ordinary reads, nested metadata and canonical sync updates. */
export function readMediaMetadata(
  value: unknown,
  expectedId?: string,
): MediaMetadata {
  const row = object(value);
  const ratingKey = identity(row.ratingKey);
  if (expectedId !== undefined && ratingKey !== expectedId)
    throw new PlexResponseError(resource);
  const common = {
    ratingKey,
    title: text(row.title),
    ...plexFields(row, {
      key: identity,
      guid: text,
      Guid: array((value) => ({ id: identity(object(value).id) })),
      playQueueItemID: integer,
      skipChildren: flag,
      parentRatingKey: identity,
      grandparentRatingKey: identity,
      slug: text,
      studio: text,
      titleSort: text,
      librarySectionTitle: text,
      librarySectionID: integer,
      librarySectionKey: text,
      grandparentKey: text,
      parentKey: text,
      grandparentTitle: text,
      parentTitle: text,
      parentThumb: text,
      grandparentThumb: text,
      composite: text,
      originalTitle: text,
      contentRating: text,
      summary: text,
      index: integer,
      parentIndex: integer,
      rating: number,
      audienceRating: number,
      userRating: number,
      Rating: array((value) => {
        const rating = object(value);
        return {
          value: number(rating.value),
          ...plexFields(rating, { image: text, type: text }),
        };
      }),
      viewOffset: integer,
      viewCount: integer,
      lastViewedAt: integer,
      year: integer,
      tagline: text,
      thumb: text,
      art: text,
      theme: text,
      duration: integer,
      originallyAvailableAt: text,
      leafCount: integer,
      viewedLeafCount: integer,
      childCount: integer,
      seasonCount: integer,
      addedAt: integer,
      updatedAt: integer,
      audienceRatingImage: text,
      primaryExtraKey: text,
      extraType: integer,
      subtype: text,
      ratingImage: text,
      Media: array(readRendition),
      Genre: array(readTag),
      Collection: array(readTag),
      Label: array(readTag),
      Producer: array(readTag),
      Country: array(readTag),
      Director: array(readTag),
      Writer: array(readTag),
      Role: array(readRole),
      Field: array((value) => {
        const field = object(value);
        return { name: text(field.name), locked: flag(field.locked) };
      }),
      OnDeck: (value) =>
        plexFields(object(value), {
          Metadata: (value) => readMediaMetadata(value),
        }),
      Children: readChildren,
      Extras: readChildren,
      Image: array((value) => {
        const image = object(value);
        return {
          type: text(image.type),
          url: text(image.url),
          ...plexFields(image, { alt: text }),
        };
      }),
      UltraBlurColors: (value) => {
        const colors = object(value);
        return {
          topLeft: text(colors.topLeft),
          topRight: text(colors.topRight),
          bottomLeft: text(colors.bottomLeft),
          bottomRight: text(colors.bottomRight),
        };
      },
      Related: (value) =>
        plexFields(object(value), {
          Hub: array((value) =>
            plexFields(object(value), { Metadata: array(readMediaMetadata) }),
          ),
        }),
      Review: array((value) => {
        const review = object(value);
        return {
          text: text(review.text),
          ...plexFields(review, {
            id: integer,
            filter: text,
            tag: text,
            image: text,
            link: text,
            source: text,
          }),
        };
      }),
    }),
  };
  const type = row.type;
  if (
    type === "movie" ||
    type === "show" ||
    type === "season" ||
    type === "episode" ||
    type === "clip"
  )
    return {
      ...common,
      type,
      ...plexFields(row, {
        chapterSource: text,
        Chapter: array((value) => {
          const chapter = object(value);
          return {
            index: integer(chapter.index),
            ...readOffsets(chapter),
            ...plexFields(chapter, { id: integer, filter: text, thumb: text }),
          };
        }),
        Marker: array((value) => {
          const marker = object(value);
          return {
            type: text(marker.type),
            ...readOffsets(marker),
            ...plexFields(marker, { id: integer, final: flag }),
          };
        }),
      }),
    };
  if (type === "artist" || type === "album" || type === "track")
    return {
      ...common,
      type,
      ...plexFields(row, {
        Style: array(readTag),
        Mood: array(readTag),
        Similar: array(readTag),
      }),
    };
  if (type === "photo" || type === "photoalbum")
    return normalizeLibraryRecord({
      ...common,
      type,
      ...plexFields(row, { Tag: array(readTag) }),
    });
  throw new PlexResponseError(resource);
}

export function readMediaContainer(value: unknown) {
  const container = plexContainer(value, resource);
  return {
    Metadata: plexArray(container.Metadata, resource),
    Directory: plexArray(container.Directory, resource),
  };
}

/** Plex also emits navigation directories (for example a show's "All episodes"). */
export function readDirectoryMetadata(value: unknown): MediaMetadata | null {
  const row = object(value);
  if (row.ratingKey === undefined && row.type === undefined) {
    identity(row.key);
    text(row.title);
    return null;
  }
  return normalizeLibraryRecord(readMediaMetadata(row), true);
}
