export class PlexResponseError extends Error {
  constructor(resource: string) {
    super(`Plex returned invalid ${resource}.`);
    this.name = "PlexResponseError";
  }
}

export function plexObject(
  value: unknown,
  resource: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PlexResponseError(resource);
  return value as Record<string, unknown>;
}

export function plexContainer(value: unknown, resource: string) {
  return plexObject(plexObject(value, resource).MediaContainer, resource);
}

/** Missing optional collections are empty; malformed collections are failures. */
export function plexArray(value: unknown, resource: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new PlexResponseError(resource);
  return value;
}
