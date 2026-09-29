import { authedGetStrict } from "features/session/model";
import type { LibraryFilterValueOption } from "../model/libraryFilters";

function valueFromFastKey(directory: Plex.Directory, filter: string) {
  if (!directory.fastKey) return undefined;

  try {
    const params = new URL(directory.fastKey, window.location.origin).searchParams;
    const exact = params.get(filter);
    if (exact) return exact;

    for (const [key, value] of params) {
      if (key.endsWith(`.${filter}`) && value) return value;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function getLibraryFilterValues(
  source: Plex.Filter,
): Promise<LibraryFilterValueOption[]> {
  const response = await authedGetStrict(source.key);
  const directories = response?.MediaContainer?.Directory;
  if (!Array.isArray(directories)) return [];

  const seen = new Set<string>();
  return directories.flatMap((directory: Plex.Directory) => {
    const value = valueFromFastKey(directory, source.filter) || directory.key;
    if (!value || !directory.title || seen.has(value)) return [];
    seen.add(value);
    return [{ value, label: directory.title }];
  });
}
