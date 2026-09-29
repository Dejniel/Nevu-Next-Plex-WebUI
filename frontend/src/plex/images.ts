import { AuthStorage } from "features/session/model";
import { getBackendURL } from "shared/api/backend";
import { queryBuilder } from "./QuickFunctions";

export const LANDSCAPE_IMAGE_WIDTHS = [320, 480, 640, 960, 1280] as const;
export const POSTER_IMAGE_WIDTHS = [240, 360, 480, 720] as const;
export const DETAIL_POSTER_IMAGE_WIDTHS = [360, 480, 720, 960, 1080] as const;
export const HERO_IMAGE_WIDTHS = [768, 1280, 1920] as const;

export function getTranscodeImageURL(
  url: string,
  width: number,
  height: number,
) {
  return `${getBackendURL()}/dynproxy/photo/:/transcode?${queryBuilder({
    width,
    height,
    url,
    "X-Plex-Token": AuthStorage.getServerToken() as string,
  })}`;
}

export function transcodeHeight(width: number, aspectRatio: number) {
  if (!Number.isFinite(width) || width <= 0) return 1;
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return width;
  return Math.max(1, Math.round(width / aspectRatio));
}

function normalizedWidths(widths: readonly number[]) {
  return [...new Set(widths)]
    .filter((width) => Number.isFinite(width) && width > 0)
    .sort((left, right) => left - right);
}

export function getResponsiveTranscodeImageProps(
  url: string,
  {
    widths,
    aspectRatio,
    sizes,
    fallbackWidth,
  }: {
    widths: readonly number[];
    aspectRatio: number;
    sizes: string;
    fallbackWidth: number;
  },
) {
  const candidates = normalizedWidths(widths);
  const fallback =
    candidates.find((width) => width >= fallbackWidth) ??
    candidates[candidates.length - 1] ??
    Math.max(1, Math.round(fallbackWidth));

  return {
    src: getTranscodeImageURL(url, fallback, transcodeHeight(fallback, aspectRatio)),
    srcSet: candidates
      .map(
        (width) =>
          `${getTranscodeImageURL(
            url,
            width,
            transcodeHeight(width, aspectRatio),
          )} ${width}w`,
      )
      .join(", "),
    sizes,
  };
}
