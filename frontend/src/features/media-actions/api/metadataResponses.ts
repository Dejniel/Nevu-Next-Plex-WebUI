import {
  plexArray,
  plexContainer,
  plexObject,
  PlexResponseError,
  plexFields,
  plexString,
  plexBoolean,
} from "shared/api/plexResponse";
import { normalizePlexPreferences } from "@nevu/contracts";
import type {
  ArtworkOption,
  MetadataCastSnapshot,
} from "../model/metadataEditing";

export function readArtworkChoices(response: unknown): ArtworkOption[] {
  const resource = "artwork choices";
  return plexArray(plexContainer(response, resource).Metadata, resource).map(
    (value) => {
      const item = plexObject(value, resource);
      const { ratingKey, thumb, key, selected, provider } = item;
      if (
        typeof ratingKey !== "string" ||
        !ratingKey ||
        (thumb !== undefined && typeof thumb !== "string") ||
        (key !== undefined && typeof key !== "string") ||
        !(thumb || key) ||
        (selected !== undefined &&
          typeof selected !== "boolean" &&
          selected !== 0 &&
          selected !== 1) ||
        (provider !== undefined && typeof provider !== "string")
      )
        throw new PlexResponseError(resource);
      return {
        url: ratingKey,
        preview: thumb || key!,
        selected: selected === true || selected === 1,
        ...(provider !== undefined && { provider }),
      };
    },
  );
}

export function readMetadataCast(
  response: unknown,
  expectedId: string,
): MetadataCastSnapshot {
  const resource = "current cast information";
  const items = plexArray(plexContainer(response, resource).Metadata, resource);
  const item = plexObject(items[0], resource);
  if (item.ratingKey !== expectedId) throw new PlexResponseError(resource);
  const Role = plexArray(item.Role, resource).map((value) => {
    const actor = plexObject(value, resource);
    if (
      typeof actor.tag !== "string" ||
      (actor.role !== undefined && typeof actor.role !== "string")
    )
      throw new PlexResponseError(resource);
    return {
      tag: actor.tag,
      ...(actor.role !== undefined && { role: actor.role }),
    };
  });
  return { ratingKey: expectedId, Role };
}

export function readMetadataPreferences(response: unknown, expectedId: string) {
  const resource = "item preferences";
  const items = plexArray(plexContainer(response, resource).Metadata, resource);
  const item = plexObject(items[0], resource);
  if (items.length !== 1 || item.ratingKey !== expectedId)
    throw new PlexResponseError(resource);
  if (item.Preferences === undefined) return [];
  const settings = plexArray(
    plexObject(item.Preferences, resource).Setting,
    resource,
  );
  const seen = new Set<string>();
  const text = (value: unknown) => plexString(value, resource);
  const scalar = (value: unknown) => {
    if (
      typeof value !== "string" &&
      typeof value !== "boolean" &&
      !(typeof value === "number" && Number.isFinite(value))
    )
      throw new PlexResponseError(resource);
    return value;
  };
  return normalizePlexPreferences(
    settings.map((value) => {
      const row = plexObject(value, resource);
      const id = text(row.id);
      if (!id || seen.has(id)) throw new PlexResponseError(resource);
      seen.add(id);
      return {
        id,
        ...plexFields(row, {
          type: text,
          label: text,
          summary: text,
          group: text,
          enumValues: text,
          value: scalar,
          default: scalar,
          hidden: (value) => plexBoolean(value, resource),
          advanced: (value) => plexBoolean(value, resource),
        }),
      };
    }),
  ).filter(
    (preference) =>
      preference.label !== preference.id || preference.choices.length > 0,
  );
}
