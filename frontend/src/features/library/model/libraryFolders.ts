import type { LibraryFolderDto } from "@nevu/contracts";

export type FolderPath = Pick<LibraryFolderDto, "id" | "title">[];

/** Store only the navigation trail in the URL; pages are keyed by the final folder ID. */
export function readFolderPath(value: string | null): FolderPath {
  if (!value || value.length > 16384) return [];
  try {
    const path: unknown = JSON.parse(value);
    if (!Array.isArray(path) || path.length > 100) return [];
    const ids = new Set<string>();
    for (const folder of path) {
      if (
        !folder ||
        typeof folder.id !== "string" ||
        !/^[0-9]{1,20}$/.test(folder.id) ||
        typeof folder.title !== "string" ||
        folder.title.length > 256 ||
        ids.has(folder.id)
      )
        return [];
      ids.add(folder.id);
    }
    return path.map(({ id, title }) => ({ id, title }));
  } catch {
    return [];
  }
}

export function writeFolderPath(params: URLSearchParams, path: FolderPath) {
  if (path.length) params.set("folderPath", JSON.stringify(path));
  else params.delete("folderPath");
}
