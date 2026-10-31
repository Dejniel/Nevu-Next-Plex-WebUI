import {
  isLibraryItemType,
  libraryItemTypeNumbers,
  validatePreferenceChanges,
  type PreferenceChanges,
} from "@nevu/contracts";
import { useServerSession } from "features/session/model";
import { prepareMusicEdit } from "./metadataMusic";
import {
  publishMediaChange,
  mediaMetadataQueryKey,
} from "entities/media/model";
import { ProxiedRequest } from "shared/api/backend";
import { PlexClient, PlexRequestError } from "shared/api/PlexClient";
import { serverQueryClient } from "shared/api/queryClient";
import { createMetadataSession } from "./metadataSession";
import {
  artworkTypes,
  metadataCapabilities,
  metadataFields,
  normalizeTags,
  type ArtworkField,
  type MetadataLockUpdate,
  type MetadataEditingItem,
  type ArtworkOption,
  type MetadataUpdate,
  type MetadataMusicParents,
} from "../model/metadataEditing";
import {
  readArtworkChoices,
  readMetadataCast,
  readMetadataPreferences,
} from "./metadataResponses";

export type ArtworkUpdate =
  | { type: "existing"; url: string; preview: string }
  | { type: "url"; url: string }
  | { type: "file"; file: File }
  | { type: "remove" };
export type ArtworkChanges = Partial<Record<ArtworkField, ArtworkUpdate>>;
export interface MetadataSaveInput {
  changes: MetadataUpdate;
  locks: MetadataLockUpdate;
  artwork: ArtworkChanges;
  preferences?: PreferenceChanges;
  parents?: MetadataMusicParents;
}
export interface MetadataSaveProgress {
  artwork: ArtworkField[];
  preferences: boolean;
  replacement?: MetadataEditingItem;
}
export class MetadataSaveError extends Error {
  constructor(
    message: string,
    public readonly completed: MetadataSaveProgress,
  ) {
    super(message);
    this.name = "MetadataSaveError";
  }
}

export function buildMetadataUpdatePath(
  data: MetadataEditingItem,
  changes: MetadataUpdate,
  locks: MetadataLockUpdate = {},
  parents: MetadataMusicParents = {},
) {
  if (
    !isLibraryItemType(data.type) ||
    !/^\d+$/.test(String(data.librarySectionID))
  )
    throw new Error("This item has no editable Plex library.");
  const params = new URLSearchParams({
    type: String(libraryItemTypeNumbers[data.type]),
    id: data.ratingKey,
  });
  if (
    data.type === "album" &&
    (changes.title !== undefined || parents.artist)
  ) {
    const artistID = parents.artist?.id ?? data.parentRatingKey;
    if (!artistID || !/^\d+$/.test(artistID))
      throw new Error("Plex could not identify this album's artist.");
    params.set("artist.id.value", artistID);
    if (changes.title === undefined)
      params.set("title.value", data.title ?? "");
  }
  if (data.type === "track" && (parents.artist || parents.album)) {
    if (parents.artist) params.set("artist.id.value", parents.artist.id);
    if (parents.album) params.set("album.id.value", parents.album.id);
  }
  for (const [field, value] of Object.entries(changes)) {
    if (Array.isArray(value)) {
      // Replace only this edited association set. Keep retained cast characters;
      // Plex resolves the original tag identities and artwork by their names.
      params.set(`${field}[].tag`, "");
      normalizeTags(value).forEach((tag, index) => {
        params.set(`${field}[${index}].tag.tag`, tag);
        if (field === "actor") {
          const actor = data.Role?.find((item) => item.tag === tag);
          if (actor?.role)
            params.set(`${field}[${index}].tagging.text`, actor.role);
        }
      });
    } else if (typeof value === "string") params.set(`${field}.value`, value);
  }
  for (const [field, locked] of Object.entries(locks))
    if (locked !== undefined) params.set(`${field}.locked`, locked ? "1" : "0");
  return `/library/sections/${data.librarySectionID}/all?${params}`;
}

function errorMessage(error: unknown) {
  if (error instanceof PlexRequestError) {
    if ([401, 403].includes(error.status))
      return "Editing metadata requires Plex server administrator access.";
    if (error.status === 404)
      return "This item or artwork is no longer available in Plex.";
    if (error.status === 400)
      return "Plex rejected one or more metadata or artwork values.";
    return `Plex could not save these changes (HTTP ${error.status}).`;
  }
  return error instanceof Error
    ? error.message
    : "Plex could not save these changes.";
}

export function validArtworkURL(value: string) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** One captured editing session for native metadata, artwork choices and binary uploads. */
export function createMetadataEditor(data: MetadataEditingItem) {
  const session = createMetadataSession();
  const { scope, token, revision } = session;
  const client = new PlexClient(
    () => token,
    (url, method, headers, body, signal) =>
      ProxiedRequest(
        url,
        method,
        {
          ...headers,
          ...(method === "PUT" && { "X-Plex-Pms-Api-Version": "1.0.0" }),
        },
        body,
        signal,
      ),
  );
  const path = `/library/metadata/${encodeURIComponent(data.ratingKey)}`;
  const capabilities = metadataCapabilities(
    data.type,
    useServerSession.getState().server,
  );
  const readPreferences = async (id: string, signal: AbortSignal) => {
    assertCurrent(signal);
    const response = await client.get(
      `/library/metadata/${id}?includePreferences=1`,
      signal,
    );
    assertCurrent(signal);
    return readMetadataPreferences(response, id);
  };
  const assertCurrent = (signal?: AbortSignal) => {
    session.assertCurrent(signal);
    if (
      !/^\d+$/.test(data.ratingKey) ||
      !/^\d+$/.test(String(data.librarySectionID)) ||
      !metadataFields(data.type).length
    )
      throw new Error("This item cannot be edited on this Plex server.");
  };
  return {
    scope,
    revision,
    id: data.ratingKey,
    assertCurrent,
    capabilities,
    preferences: (signal: AbortSignal) =>
      readPreferences(data.ratingKey, signal),
    async artwork(
      field: ArtworkField,
      signal: AbortSignal,
    ): Promise<ArtworkOption[]> {
      assertCurrent(signal);
      if (!capabilities.artwork.includes(field))
        throw new Error("This artwork type is unavailable for this item.");
      const response = await client.get(
        `${path}/${artworkTypes[field].choices}`,
        signal,
      );
      assertCurrent(signal);
      return readArtworkChoices(response);
    },
    async save(
      {
        changes,
        locks,
        artwork,
        preferences: preferenceInput = {},
        parents = {},
      }: MetadataSaveInput,
      signal: AbortSignal,
    ) {
      assertCurrent(signal);
      if (
        (changes.editionTitle !== undefined ||
          Object.hasOwn(locks, "editionTitle")) &&
        !metadataCapabilities(data.type, useServerSession.getState().server)
          .edition
      )
        throw new Error(
          "Editing editions requires a supported Plex server and Plex Pass for its owner.",
        );
      const allowed = new Set<string>(
        metadataFields(data.type).map((field) => field.id),
      );
      if (
        Object.keys(changes).some((field) => !allowed.has(field)) ||
        Object.keys(locks).some(
          (field) =>
            !allowed.has(field) &&
            !capabilities.artwork.includes(field as ArtworkField),
        )
      )
        throw new Error("This field is not editable for this media type.");
      for (const [field, update] of Object.entries(artwork)) {
        if (!capabilities.artwork.includes(field as ArtworkField))
          throw new Error("This artwork type is unavailable for this item.");
        if (update.type === "url" && !validArtworkURL(update.url))
          throw new Error("Enter an HTTP or HTTPS image URL.");
        if (
          update.type === "file" &&
          (!update.file.size ||
            !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
              update.file.type,
            ))
        )
          throw new Error("Choose a JPEG, PNG, WebP or GIF image.");
      }
      const music =
        Object.keys(parents).length ||
        (["artist", "album"].includes(data.type) && changes.title !== undefined)
          ? await prepareMusicEdit(client, data, changes, parents, signal)
          : { data, parents, destination: undefined };
      const target = music.destination ?? music.data;
      const targetPath = `/library/metadata/${target.ratingKey}`;
      const preferenceUpdates = Object.keys(preferenceInput).length
        ? validatePreferenceChanges(
            await readPreferences(target.ratingKey, signal),
            preferenceInput,
          )
        : {};
      let metadataPath =
        Object.keys(changes).length ||
        Object.keys(locks).length ||
        Object.keys(parents).length
          ? buildMetadataUpdatePath(target, changes, locks, music.parents)
          : null;
      const completed: MetadataSaveProgress = {
        artwork: [],
        preferences: false,
      };
      let attempted = false;
      try {
        if (music.destination) {
          attempted = true;
          await client.put(
            buildMetadataUpdatePath(
              music.data,
              { title: changes.title ?? music.data.title ?? "" },
              {},
              music.parents,
            ),
            undefined,
            signal,
          );
          completed.replacement = music.destination;
          assertCurrent(signal);
        }
        if (changes.actor !== undefined) {
          // Cast names are editable; their character information is not. Read
          // it at save time so an intervening refresh cannot lose those values.
          const response = await client.get(`${path}?includeDetails=1`, signal);
          assertCurrent(signal);
          const latest = readMetadataCast(response, data.ratingKey);
          metadataPath = buildMetadataUpdatePath(
            { ...data, Role: latest.Role },
            changes,
            locks,
          );
        }
        for (const [name, update] of Object.entries(artwork)) {
          const field = name as ArtworkField;
          assertCurrent(signal);
          attempted = true;
          if (update.type === "remove")
            await client.delete(`${targetPath}/${field}`, signal);
          else if (update.type === "existing")
            await client.put(
              `${targetPath}/${artworkTypes[field].selection}?${new URLSearchParams({ url: update.url })}`,
              undefined,
              signal,
            );
          else if (update.type === "url")
            await client.post(
              `${targetPath}/${artworkTypes[field].choices}?${new URLSearchParams({ url: update.url })}`,
              undefined,
              signal,
            );
          else {
            await client.upload(
              `${targetPath}/${artworkTypes[field].choices}`,
              update.file,
              signal,
            );
          }
          completed.artwork.push(field);
        }
        assertCurrent(signal);
        if (Object.keys(preferenceUpdates).length) {
          attempted = true;
          await client.put(
            `${targetPath}/prefs?${new URLSearchParams(preferenceUpdates)}`,
            undefined,
            signal,
          );
          completed.preferences = true;
        }
        // Artwork selection/upload can lock fields itself. Apply the user's
        // final lock choices after assets, in the same write as edited values.
        if (metadataPath) {
          attempted = true;
          await client.put(metadataPath, undefined, signal);
        }
        assertCurrent(signal);
      } catch (error) {
        throw new MetadataSaveError(
          `${completed.replacement ? "Plex merged the music items. " : ""}${completed.artwork.length ? "Some artwork was saved. " : completed.preferences ? "Item settings were saved. " : ""}${errorMessage(error)}`,
          completed,
        );
      } finally {
        if (attempted && scope) {
          // Refresh through the existing owners, including partial/aborted writes.
          let refetchType: "active" | "none" = "none";
          try {
            assertCurrent();
            refetchType = "active";
          } catch {
            /* The old scope stays invalidated without fetching with a new token. */
          }
          const changedIDs = new Set([
            data.ratingKey,
            completed.replacement?.ratingKey ?? data.ratingKey,
          ]);
          for (const id of changedIDs) {
            void serverQueryClient.invalidateQueries({
              refetchType,
              queryKey: mediaMetadataQueryKey(scope, id),
              exact: true,
            });
            void serverQueryClient.invalidateQueries({
              refetchType,
              queryKey: ["media-artwork", scope.serverId, scope.profileKey, id],
            });
            void serverQueryClient.invalidateQueries({
              refetchType,
              queryKey: [
                "metadata-preferences",
                scope.serverId,
                scope.profileKey,
                revision,
                id,
              ],
            });
          }
          if (Object.keys(parents).length) {
            for (const id of [
              data.parentRatingKey,
              data.grandparentRatingKey,
              parents.artist?.id,
              parents.album?.id,
            ])
              if (id) changedIDs.add(id);
          }
          for (const id of changedIDs)
            publishMediaChange({
              ...scope,
              sectionId: String(data.librarySectionID),
              kind: "item",
              effect: "unknown",
              id,
            });
        }
      }
      return { ratingKey: target.ratingKey };
    },
  };
}
