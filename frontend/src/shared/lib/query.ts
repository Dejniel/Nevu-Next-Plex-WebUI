export function queryBuilder(values: Record<string, unknown>) {
  return Object.entries(values)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
}
