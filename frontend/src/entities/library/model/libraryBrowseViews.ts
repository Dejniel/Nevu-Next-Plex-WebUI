import {
  isLibraryItemType,
  isVideoLibraryItemType,
  type LibraryItemType,
} from "@nevu/contracts";

export type LibraryBrowseViewId = LibraryItemType | "folders";
export interface LibraryBrowseView {
  id: LibraryBrowseViewId;
  title: string;
  source: "all" | "folders";
  presentation: "grid" | "list";
  gridLayout?: "video" | "square" | "photo";
  descriptor?: Plex.Type;
}

/** The selector chooses a browsing workflow; presentation never changes query identity. */
export function libraryBrowseViews(
  library: Plex.MediaContainer | undefined,
): LibraryBrowseView[] {
  const types =
    library?.Type?.filter(
      (entry): entry is Plex.Type & { type: LibraryItemType } =>
        isLibraryItemType(entry.type),
    ) ?? [];
  const views: LibraryBrowseView[] = types.map((descriptor) => ({
    id: descriptor.type,
    title: descriptor.title,
    source: "all",
    presentation: descriptor.type === "track" ? "list" : "grid",
    gridLayout: isVideoLibraryItemType(descriptor.type)
      ? "video"
      : descriptor.type === "photo" || descriptor.type === "photoalbum"
        ? "photo"
        : "square",
    descriptor,
  }));
  if (
    types.some(
      (entry) => isVideoLibraryItemType(entry.type) || entry.type === "artist",
    )
  )
    views.push({
      id: "folders",
      title: "Folders",
      source: "folders",
      presentation: "list",
    });
  return views;
}
