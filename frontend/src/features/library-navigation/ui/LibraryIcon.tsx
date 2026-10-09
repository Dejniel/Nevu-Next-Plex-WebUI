import {
  MovieOutlined,
  LiveTvOutlined,
  MusicNoteOutlined,
  PhotoLibraryOutlined,
  LibraryBooksOutlined,
} from "@mui/icons-material";
import type { NavigationLibrary } from "../model/navigation";

export function LibraryIcon({ type }: Pick<NavigationLibrary, "type">) {
  const Icon =
    type === "movie"
      ? MovieOutlined
      : type === "show"
        ? LiveTvOutlined
        : type === "artist"
          ? MusicNoteOutlined
          : type === "photo"
            ? PhotoLibraryOutlined
            : LibraryBooksOutlined;
  return <Icon fontSize="small" />;
}
