export class PlexResponseError extends Error {
  constructor(
    readonly resource: string,
    readonly fields: readonly string[] = [],
  ) {
    super(
      `Plex returned invalid ${resource}${fields.length ? ` (${fields.join(".")})` : ""}.`,
    );
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

export function plexString(value: unknown, resource: string): string {
  if (typeof value !== "string") throw new PlexResponseError(resource);
  return value;
}

export function plexNumber(value: unknown, resource: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new PlexResponseError(resource);
  return value;
}

export function plexInteger(value: unknown, resource: string): number {
  const number = plexNumber(value, resource);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new PlexResponseError(resource);
  return number;
}

export function plexBoolean(value: unknown, resource: string): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new PlexResponseError(resource);
}

/** Project declared optional fields only. Missing values remain missing. */
export function plexFields<
  S extends Record<string, (value: unknown) => unknown>,
>(
  row: Record<string, unknown>,
  schema: S,
): { [K in keyof S]?: ReturnType<S[K]> } {
  const result: Record<string, unknown> = {};
  for (const [key, read] of Object.entries(schema)) {
    if (row[key] === undefined) continue;
    try {
      result[key] = read(row[key]);
    } catch (error) {
      if (error instanceof PlexResponseError)
        throw new PlexResponseError(error.resource, [key, ...error.fields]);
      throw error;
    }
  }
  return result as { [K in keyof S]?: ReturnType<S[K]> };
}
