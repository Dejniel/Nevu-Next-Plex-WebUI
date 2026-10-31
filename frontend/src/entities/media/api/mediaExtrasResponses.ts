import {
  plexArray,
  plexContainer,
  plexFields,
  plexInteger,
  plexObject,
  plexString,
  PlexResponseError,
} from "shared/api/plexResponse";
import type { DiscoverExtra } from "../model/mediaExtras";

/** Project only cloud extra fields. PMS rendition/file IDs are a different contract. */
export function readDiscoverExtras(response: unknown): DiscoverExtra[] {
  const resource = "Discover extras";
  const container = plexContainer(response, resource);
  const text = (value: unknown) => plexString(value, resource);
  const integer = (value: unknown) => plexInteger(value, resource);
  const identity = (value: unknown) => {
    const key = text(value);
    if (!key.trim()) throw new PlexResponseError(resource);
    return key;
  };
  const items = plexArray(container.Metadata, resource).map(
    (value): DiscoverExtra => {
      const row = plexObject(value, resource);
      const data = {
        title: text(row.title),
        ...plexFields(row, {
          ratingKey: identity,
          key: identity,
          guid: text,
          thumb: text,
          duration: integer,
          extraType: integer,
          subtype: text,
          Media: (value) =>
            plexArray(value, resource).map((value) =>
              plexFields(plexObject(value, resource), {
                videoResolution: text,
                Part: (value) =>
                  plexArray(value, resource).map((value) =>
                    plexFields(plexObject(value, resource), { key: identity }),
                  ),
              }),
            ),
        }),
      };
      if (data.ratingKey) return { ...data, ratingKey: data.ratingKey };
      if (data.key) return { ...data, key: data.key };
      throw new PlexResponseError(resource);
    },
  );
  if (container.size !== undefined && integer(container.size) !== items.length)
    throw new PlexResponseError(resource);
  return items;
}

export function readDiscoverStream(response: unknown): string {
  const resource = "Discover stream";
  const row = plexObject(response, resource);
  if (row.url === undefined || row.url === "")
    throw new Error("Plex Discover did not return a stream.");
  const url = plexString(row.url, resource);
  try {
    if (url !== url.trim() || new URL(url).protocol !== "https:")
      throw new Error();
  } catch {
    throw new PlexResponseError(resource);
  }
  return url;
}
