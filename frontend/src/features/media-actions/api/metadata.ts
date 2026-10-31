import {
  isLibraryItemType,
  libraryItemTypeNumbers,
  validatePreferenceChanges,
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
import {
  metadataArtworkError,
  type ArtworkUpdate,
  type MetadataSaveInput,
  type MetadataSaveProgress,
} from "../model/metadataEditorDraft";

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

async function saveArtwork(
  client: PlexClient,
  id: string,
  field: ArtworkField,
  update: ArtworkUpdate,
  signal: AbortSignal,
) {
  const path = `/library/metadata/${id}`;
  const { choices, selection } = artworkTypes[field];
  switch (update.type) {
    case "remove":
      return client.delete(`${path}/${field}`, signal);
    case "existing":
      return client.put(
        `${path}/${selection}?${new URLSearchParams({ url: update.url })}`,
        undefined,
        signal,
      );
    case "url":
      return client.post(
        `${path}/${choices}?${new URLSearchParams({ url: update.url })}`,
        undefined,
        signal,
      );
    case "file":
      return client.upload(`${path}/${choices}`, update.file, signal);
  }
}

/** One captured editing session for native metadata, artwork choices and binary uploads. */
export function createMetadataEditor(data: MetadataEditingItem) {
  const session = createMetadataSession();
  const { scope, token, revision } = session;
  const resourceKey = (id: string) =>
    [
      "metadata-editor",
      scope?.serverId,
      scope?.profileKey,
      revision,
      id,
    ] as const;
  const client = new PlexClient(
    () => {
      // Every request, including helper reads and binary uploads, retains the
      // captured session. A completed earlier step cannot authorize the next.
      assertCurrent();
      return token;
    },
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
  async function prepareSave(
    {
      changes,
      locks,
      artwork,
      preferences = {},
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
      const error = metadataArtworkError(update);
      if (error) throw new Error(error);
    }
    const music =
      Object.keys(parents).length ||
      (["artist", "album"].includes(data.type) && changes.title !== undefined)
        ? await prepareMusicEdit(client, data, changes, parents, signal)
        : { data, parents, destination: undefined };
    let target = music.destination ?? music.data;
    const preferenceUpdates = Object.keys(preferences).length
      ? validatePreferenceChanges(
          await readPreferences(target.ratingKey, signal),
          preferences,
        )
      : {};
    if (changes.actor !== undefined) {
      // Read characters before any write, preserving an intervening refresh.
      const response = await client.get(`${path}?includeDetails=1`, signal);
      target = {
        ...target,
        Role: readMetadataCast(response, data.ratingKey).Role,
      };
    }
    const metadataPath =
      Object.keys(changes).length ||
      Object.keys(locks).length ||
      Object.keys(parents).length
        ? buildMetadataUpdatePath(target, changes, locks, music.parents)
        : null;
    const mergePath = music.destination
      ? buildMetadataUpdatePath(
          music.data,
          { title: changes.title ?? music.data.title ?? "" },
          {},
          music.parents,
        )
      : null;
    assertCurrent(signal);
    return { target, metadataPath, mergePath, preferenceUpdates };
  }
  return {
    scope,
    revision,
    id: data.ratingKey,
    queryKey: resourceKey(data.ratingKey),
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
    async save(input: MetadataSaveInput, signal: AbortSignal) {
      const { target, metadataPath, mergePath, preferenceUpdates } =
        await prepareSave(input, signal);
      const completed: MetadataSaveProgress = {
        artwork: [],
        preferences: false,
      };
      let attempted = false;
      try {
        if (mergePath) {
          attempted = true;
          await client.put(mergePath, undefined, signal);
          completed.replacement = target;
          assertCurrent(signal);
        }
        for (const [name, update] of Object.entries(input.artwork)) {
          const field = name as ArtworkField;
          assertCurrent(signal);
          attempted = true;
          await saveArtwork(client, target.ratingKey, field, update, signal);
          completed.artwork.push(field);
        }
        assertCurrent(signal);
        if (Object.keys(preferenceUpdates).length) {
          attempted = true;
          await client.put(
            `/library/metadata/${target.ratingKey}/prefs?${new URLSearchParams(preferenceUpdates)}`,
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
              // Canonical metadata is read by the scoped change reconciler.
              // Keep old scopes stale without issuing a duplicate active read.
              refetchType: "none",
              queryKey: mediaMetadataQueryKey(scope, id),
              exact: true,
            });
            void serverQueryClient.invalidateQueries({
              refetchType,
              queryKey: resourceKey(id),
            });
          }
          if (Object.keys(input.parents ?? {}).length) {
            for (const id of [
              data.parentRatingKey,
              data.grandparentRatingKey,
              input.parents?.artist?.id,
              input.parents?.album?.id,
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
