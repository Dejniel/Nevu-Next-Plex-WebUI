import { isLibraryItemType, libraryItemTypeNumbers } from "@nevu/contracts";
import {
  publishMediaChange,
  mediaMetadataQueryKey,
} from "entities/media/model";
import { ProxiedRequest } from "shared/api/backend";
import { PlexClient, PlexRequestError } from "shared/api/PlexClient";
import { serverQueryClient } from "shared/api/queryClient";
import { createMetadataSession } from "./metadataSession";
import {
  metadataFields,
  metadataTagFields,
  normalizeTags,
  type ArtworkField,
  type MetadataLockUpdate,
  type MetadataTagField,
  type MetadataUpdate,
} from "../model/metadataEditing";

export type ArtworkUpdate =
  | { type: "existing"; url: string; preview: string }
  | { type: "url"; url: string }
  | { type: "file"; file: File }
  | { type: "remove" };
export type ArtworkChanges = Partial<Record<ArtworkField, ArtworkUpdate>>;
export interface ArtworkOption {
  url: string;
  preview: string;
  selected: boolean;
  provider?: string;
}

export class MetadataSaveError extends Error {
  constructor(
    message: string,
    public readonly completedArtwork: readonly ArtworkField[],
  ) {
    super(message);
    this.name = "MetadataSaveError";
  }
}

export function buildMetadataUpdatePath(
  data: Plex.Metadata,
  changes: MetadataUpdate,
  locks: MetadataLockUpdate = {},
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
  if (data.type === "album" && changes.title !== undefined) {
    if (!data.parentRatingKey || !/^\d+$/.test(data.parentRatingKey))
      throw new Error("Plex could not identify this album's artist.");
    params.set("artist.id.value", data.parentRatingKey);
  }
  for (const [field, value] of Object.entries(changes)) {
    if (Array.isArray(value)) {
      // Replace only this edited association set. Keep retained cast characters;
      // Plex resolves the original tag identities and artwork by their names.
      params.set(`${field}[].tag`, "");
      const property = metadataTagFields[field as MetadataTagField]?.[0];
      const original = property ? data[property] : undefined;
      normalizeTags(value).forEach((tag, index) => {
        params.set(`${field}[${index}].tag.tag`, tag);
        if (field === "actor" && Array.isArray(original)) {
          const actor = original.find((item) => item.tag === tag) as
            | Plex.Role
            | undefined;
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
export function createMetadataEditor(data: Plex.Metadata) {
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
    async artwork(
      field: ArtworkField,
      signal: AbortSignal,
    ): Promise<ArtworkOption[]> {
      assertCurrent(signal);
      const response = await client.get<{
        MediaContainer?: {
          Metadata?: {
            ratingKey: string;
            key?: string;
            thumb?: string;
            selected?: boolean;
            provider?: string;
          }[];
        };
      }>(`${path}/${field === "thumb" ? "posters" : "arts"}`, signal);
      assertCurrent(signal);
      if (!response.MediaContainer)
        throw new Error("Plex returned invalid artwork choices.");
      return (response.MediaContainer.Metadata ?? []).flatMap((item) =>
        item.ratingKey && (item.thumb || item.key)
          ? [
              {
                url: item.ratingKey,
                preview: item.thumb || item.key!,
                selected: Boolean(item.selected),
                provider: item.provider,
              },
            ]
          : [],
      );
    },
    async save(
      changes: MetadataUpdate,
      locks: MetadataLockUpdate,
      artwork: ArtworkChanges,
      signal: AbortSignal,
    ) {
      assertCurrent(signal);
      const allowed = new Set<string>(
        metadataFields(data.type).map((field) => field.id),
      );
      if (
        Object.keys(changes).some((field) => !allowed.has(field)) ||
        Object.keys(locks).some(
          (field) =>
            !allowed.has(field) && field !== "thumb" && field !== "art",
        )
      )
        throw new Error("This field is not editable for this media type.");
      for (const update of Object.values(artwork)) {
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
      let metadataPath =
        Object.keys(changes).length || Object.keys(locks).length
          ? buildMetadataUpdatePath(data, changes, locks)
          : null;
      const completed: ArtworkField[] = [];
      let attempted = false;
      try {
        if (changes.actor !== undefined) {
          // Cast names are editable; their character information is not. Read
          // it at save time so an intervening refresh cannot lose those values.
          const response = await client.get<{
            MediaContainer?: { Metadata?: Plex.Metadata[] };
          }>(`${path}?includeDetails=1`, signal);
          assertCurrent(signal);
          const latest = response.MediaContainer?.Metadata?.[0];
          if (latest?.ratingKey !== data.ratingKey)
            throw new Error(
              "Plex could not load the current cast information.",
            );
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
            await client.delete(`${path}/${field}`, signal);
          else if (update.type === "existing")
            await client.put(
              `${path}/${field === "thumb" ? "poster" : "art"}?${new URLSearchParams({ url: update.url })}`,
              undefined,
              signal,
            );
          else if (update.type === "url")
            await client.post(
              `${path}/${field === "thumb" ? "posters" : "arts"}?${new URLSearchParams({ url: update.url })}`,
              undefined,
              signal,
            );
          else {
            const response = await fetch(
              `/dynproxy${path}/${field === "thumb" ? "posters" : "arts"}`,
              {
                method: "POST",
                headers: {
                  "X-Plex-Token": token!,
                  Accept: "application/json",
                  "Content-Type": update.file.type,
                },
                body: update.file,
                signal,
              },
            );
            if (!response.ok) throw new PlexRequestError(response.status, null);
            // The status acknowledges the upload; discarding its response body
            // must not turn accepted artwork into a repeatable failed upload.
            await response.body?.cancel().catch(() => undefined);
          }
          completed.push(field);
        }
        assertCurrent(signal);
        // Artwork selection/upload can lock fields itself. Apply the user's
        // final lock choices after assets, in the same write as edited values.
        if (metadataPath) {
          attempted = true;
          await client.put(metadataPath, undefined, signal);
        }
        assertCurrent(signal);
      } catch (error) {
        throw new MetadataSaveError(
          `${completed.length ? "Some artwork was saved. " : ""}${errorMessage(error)}`,
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
          void serverQueryClient.invalidateQueries({
            refetchType,
            queryKey: mediaMetadataQueryKey(scope, data.ratingKey),
            exact: true,
          });
          void serverQueryClient.invalidateQueries({
            refetchType,
            queryKey: [
              "media-artwork",
              scope.serverId,
              scope.profileKey,
              data.ratingKey,
            ],
          });
          publishMediaChange({
            ...scope,
            kind: "item",
            effect: "unknown",
            id: data.ratingKey,
          });
        }
      }
    },
  };
}
