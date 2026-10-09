import type { DiscoverTitle } from "../model/mediaIdentity";
import { getPlexTitleIdentity } from "../model/mediaIdentity";
import {
  PlexResponseError,
  plexObject,
  plexFields,
  plexString,
  plexNumber,
  plexInteger,
  plexArray,
} from "shared/api/plexResponse";

const resource = "title metadata";
const text = (value: unknown) => plexString(value, resource);
const number = (value: unknown) => plexNumber(value, resource);
const integer = (value: unknown) => plexInteger(value, resource);

export function readMediaTag(value: unknown) {
  const tag = plexObject(value, resource);
  return {
    tag: text(tag.tag),
    ...plexFields(tag, { id: integer, filter: text }),
  };
}

/** Display fields shared by full server metadata and Discover title responses. */
export function readTitleFields(row: Record<string, unknown>) {
  return plexFields(row, {
    titleSort: text,
    year: integer,
    thumb: text,
    art: text,
    summary: text,
    duration: integer,
    seasonCount: integer,
    childCount: integer,
    addedAt: integer,
    rating: number,
    ratingImage: text,
    audienceRating: number,
    audienceRatingImage: text,
    Genre: (value) => plexArray(value, resource).map(readMediaTag),
    Rating: (value) =>
      plexArray(value, resource).map((value) => {
        const rating = plexObject(value, resource);
        return {
          value: number(rating.value),
          ...plexFields(rating, { image: text, type: text }),
        };
      }),
  });
}

/** A Discover title never owns a server library, files or local watch state. */
export function readDiscoverTitle(value: unknown): DiscoverTitle {
  const row = plexObject(value, resource);
  const identity = getPlexTitleIdentity(row.guid);
  if (!identity || identity.type !== row.type || !text(row.ratingKey).trim())
    throw new PlexResponseError("Discover title identity");
  return {
    ratingKey: identity.id,
    guid: identity.guid,
    type: identity.type,
    title: text(row.title),
    ...readTitleFields(row),
  };
}
