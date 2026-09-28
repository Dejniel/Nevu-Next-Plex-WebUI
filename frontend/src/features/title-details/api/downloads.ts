import { AuthStorage } from "auth/AuthStorage";
import { getBackendURL } from "shared/api/backend";

export interface OriginalDownload {
  href: string;
  filename: string;
  media: Plex.Media;
  part: Plex.Part;
}

function fallbackFilename(data: Plex.Metadata, part: Plex.Part): string {
  const title = Array.from(
    (data.title || "plex-media").replace(/[<>:"/\\|?*]/g, "_"),
    (character) => (character.charCodeAt(0) < 32 ? "_" : character),
  ).join("");
  return part.container ? `${title}.${part.container}` : title;
}

export function originalFilename(
  data: Plex.Metadata,
  part: Plex.Part,
): string {
  return part.file?.split(/[\\/]/).pop() || fallbackFilename(data, part);
}

export function getOriginalDownloads(
  data: Plex.Metadata,
  allowDownloads: boolean,
): OriginalDownload[] {
  if (!allowDownloads) return [];
  const token = AuthStorage.getServerToken();
  if (!token) return [];

  return (data.Media || []).flatMap((media) =>
    (media.Part || [])
      .filter((part) => Boolean(part.key))
      .map((part) => {
        const source = new URL(part.key, "http://plex.local");
        source.searchParams.set("download", "1");
        source.searchParams.set("X-Plex-Token", token);

        return {
          href: `${getBackendURL()}/dynproxy${source.pathname}?${source.searchParams.toString()}`,
          filename: originalFilename(data, part),
          media,
          part,
        };
      }),
  );
}
