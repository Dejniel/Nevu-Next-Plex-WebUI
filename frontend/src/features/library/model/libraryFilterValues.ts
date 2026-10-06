import type { LibraryFilterValueOption } from "./libraryFilters";

export function libraryFilterValues(
  directories: readonly Plex.Directory[] | undefined,
  filter: string,
): LibraryFilterValueOption[] {
  const seen = new Set<string>();
  return (directories ?? []).flatMap((directory) => {
    let params: URLSearchParams | undefined;
    try {
      params = new URL(directory.fastKey ?? "", window.location.origin).searchParams;
    } catch { /* An unusable fast key still has a Plex directory key. */ }
    const value = params?.get(filter) || [...(params ?? [])].find(([key, value]) =>
      key.endsWith(`.${filter}`) && value,
    )?.[1] || directory.key;
    if (!value || !directory.title || seen.has(value)) return [];
    seen.add(value);
    return [{ value, label: directory.title }];
  });
}
