import { getStreamProps } from "./playback";
import { buildPlaybackSourceUrl } from "./playbackSource";
import type { MediaVersion } from "entities/media/model";

jest.mock("shared/lib/platform", () => ({
  platformCache: { isDesktop: false },
}));
jest.mock("shared/api/backend", () => ({
  getBackendURL: () => "http://backend",
}));
jest.mock("features/session/model", () => ({
  getXPlexProps: () => ({ token: "session-token" }),
}));
jest.mock("shared/lib/query", () => ({
  queryBuilder: (values: Record<string, unknown>) =>
    new URLSearchParams(
      Object.entries(values).map(([key, value]) => [key, String(value)]),
    ).toString(),
}));
jest.mock("./playback", () => ({
  getStreamProps: jest.fn(),
}));

const streamProps = getStreamProps as jest.Mock;

beforeEach(() => {
  streamProps.mockReturnValue({ path: "/library/metadata/42" });
});

const version = {
  mediaIndex: 2,
  partIndex: 1,
  media: { id: 10 } as Plex.Media,
  part: { id: 20, key: "/library/parts/20/file.mkv" } as Plex.Part,
} satisfies MediaVersion;
const metadata = { ratingKey: "42" } as Plex.Metadata;

it("builds a direct-play URL for the selected file", () => {
  const url = buildPlaybackSourceUrl(metadata, { bitrate: -1 }, version);

  expect(url).toBe(
    "http://backend/dynproxy/library/parts/20/file.mkv?token=session-token",
  );
  expect(getStreamProps).not.toHaveBeenCalled();
});

it("builds a transcoder URL with the selected media and part indexes", () => {
  const url = buildPlaybackSourceUrl(metadata, { bitrate: 8000 }, version);

  expect(getStreamProps).toHaveBeenCalledWith("42", {
    maxVideoBitrate: 8000,
    autoAdjustQuality: undefined,
    mediaIndex: 2,
    partIndex: 1,
  });
  expect(url).toBe(
    "http://backend/dynproxy/video/:/transcode/universal/start.mpd?path=%2Flibrary%2Fmetadata%2F42",
  );
});
