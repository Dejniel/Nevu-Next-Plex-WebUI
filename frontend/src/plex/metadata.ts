import { AuthStorage } from "../auth/AuthStorage";
import { ProxiedRequest } from "../backendURL";

export interface MetadataUpdate {
  title?: string;
  sortTitle?: string;
  originalTitle?: string;
  summary?: string;
  tagline?: string;
  studio?: string;
  contentRating?: string;
  originallyAvailableAt?: string;
  year?: string;
}

export class MetadataUpdateError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MetadataUpdateError";
  }
}

export function buildMetadataUpdatePath(
  ratingKey: string,
  changes: MetadataUpdate,
): string {
  const params = new URLSearchParams();
  Object.entries(changes).forEach(([field, value]) => {
    if (value !== undefined) params.set(field, value);
  });

  return `/library/metadata/${encodeURIComponent(ratingKey)}?${params.toString()}`;
}

export async function updateMetadata(
  ratingKey: string,
  changes: MetadataUpdate,
): Promise<void> {
  if (!ratingKey) throw new Error("The metadata item has no Plex ID.");
  if (Object.keys(changes).length === 0) return;

  const token = AuthStorage.getServerToken();
  if (!token) throw new Error("The Plex session has expired. Sign in again.");

  const response = await ProxiedRequest(
    buildMetadataUpdatePath(ratingKey, changes),
    "PUT",
    {
      Accept: "application/json",
      "X-Plex-Token": token,
      "X-Plex-Pms-Api-Version": "1.0.0",
    },
    {},
  );

  if (response.status >= 200 && response.status < 300) return;
  if (response.status === 400)
    throw new MetadataUpdateError(
      "Plex rejected one or more metadata values.",
      response.status,
    );
  if (response.status === 401 || response.status === 403)
    throw new MetadataUpdateError(
      "Editing metadata requires Plex server administrator access.",
      response.status,
    );
  if (response.status === 404)
    throw new MetadataUpdateError(
      "This item no longer exists in the Plex library.",
      response.status,
    );

  throw new MetadataUpdateError(
    "Nevu could not update metadata on the Plex server.",
    response.status,
  );
}

export function applyMetadataUpdate(
  metadata: Plex.Metadata,
  changes: MetadataUpdate,
): Plex.Metadata {
  const next = { ...metadata };

  if (changes.title !== undefined) next.title = changes.title;
  if (changes.sortTitle !== undefined) next.titleSort = changes.sortTitle;
  if (changes.originalTitle !== undefined)
    next.originalTitle = changes.originalTitle;
  if (changes.summary !== undefined) next.summary = changes.summary;
  if (changes.tagline !== undefined) next.tagline = changes.tagline;
  if (changes.studio !== undefined) next.studio = changes.studio;
  if (changes.contentRating !== undefined)
    next.contentRating = changes.contentRating;
  if (changes.originallyAvailableAt !== undefined)
    next.originallyAvailableAt = changes.originallyAvailableAt;
  if (changes.year !== undefined) next.year = Number(changes.year) || 0;

  return next;
}
