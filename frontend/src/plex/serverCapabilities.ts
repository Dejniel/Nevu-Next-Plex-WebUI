export function hasPlexFeature(value: unknown, feature: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value))
    return value.some((entry) => hasPlexFeature(entry, feature));

  const object = value as Record<string, unknown>;
  if (object.type === feature) return true;
  return Object.values(object).some((entry) => hasPlexFeature(entry, feature));
}
