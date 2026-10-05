import type { Mock } from "vitest";
import { plexClient } from "features/session/model";
import {
  createMediaPlaybackSource,
  getMediaPlaybackDecision,
  releaseMediaPlayback,
} from "./mediaPlayback";
import type { MediaVersion } from "../model/mediaVersions";
import type { PlexStreamPlan } from "../model/mediaPlayback";
import { uuidV4 } from "shared/lib/identifiers";

vi.mock("features/session/model", async () => ({
  PlexRequestError: (await import("shared/api/PlexClient")).PlexRequestError,
  getXPlexProps: () => ({ "X-Plex-Token": "fixture" }),
  plexClient: { get: vi.fn() },
}));
vi.mock("shared/api/backend", () => ({ getBackendURL: () => "http://backend" }));
vi.mock("shared/lib/identifiers", () => ({ uuidV4: vi.fn() }));
const version = {
  mediaIndex: 2,
  partIndex: 1,
  media: { videoCodec: "h264", audioCodec: "aac", container: "mkv" },
  part: { key: "/library/parts/20/file.mkv", Stream: [{ streamType: 2, id: 4, selected: true }] },
} as MediaVersion;
const metadata = { ratingKey: "42" } as Plex.Metadata;
const plan: PlexStreamPlan = {
  kind: "plex",
  protocol: "dash",
  copyVideo: true,
  copyAudio: true,
  videoCodec: "h264",
  audioCodec: "aac",
  subtitles: "none",
};
beforeEach(() => {
  vi.resetAllMocks();
  (uuidV4 as Mock).mockReturnValue("session-42");
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  (plexClient.get as Mock).mockResolvedValue({ MediaContainer: { generalDecisionCode: 1001 } });
});

it("opens the original without any decision or stream request", () => {
  const source = createMediaPlaybackSource(metadata, version, {}, { kind: "original" });
  expect(source).toMatchObject({ type: "file", sessionID: undefined });
  expect(new URL(source.url).pathname).toBe("/dynproxy/library/parts/20/file.mkv");
  expect(plexClient.get).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("starts a selected Plex remux without a preflight decision", () => {
  const source = createMediaPlaybackSource(metadata, version, { bitrate: -1 }, plan);
  const request = new URL(source.url);
  expect(request.pathname).toBe("/dynproxy/video/:/transcode/universal/start.mpd");
  expect(request.searchParams.get("mediaIndex")).toBe("2");
  expect(request.searchParams.get("partIndex")).toBe("1");
  expect(request.searchParams.get("audioStreamID")).toBe("4");
  expect(request.searchParams.get("directPlay")).toBe("0");
  expect(request.searchParams.get("directStream")).toBe("1");
  expect(request.searchParams.has("maxVideoBitrate")).toBe(false);
  expect(source).toMatchObject({ type: "dash", sessionID: "session-42" });
  expect(plexClient.get).not.toHaveBeenCalled();
});

it("keeps quality and conversion choices in the stream request", () => {
  const source = createMediaPlaybackSource(
    metadata,
    version,
    { bitrate: 240 },
    {
      ...plan,
      protocol: "hls",
      copyVideo: false,
      copyAudio: false,
    },
  );
  const request = new URL(source.url);
  expect(request.pathname).toBe("/dynproxy/video/:/transcode/universal/start.m3u8");
  expect(request.searchParams.get("maxVideoBitrate")).toBe("240");
  expect(request.searchParams.get("directStream")).toBe("0");
  expect(request.searchParams.get("directStreamAudio")).toBe("0");
});

it("reserves subtitle extraction without blocking video preparation", async () => {
  (uuidV4 as Mock).mockReturnValueOnce("video-session").mockReturnValueOnce("subtitle-session");
  const source = createMediaPlaybackSource(
    metadata,
    version,
    { bitrate: 240 },
    {
      ...plan,
      subtitles: "sidecar",
      subtitle: { id: 6, languageCode: "eng" } as Plex.Stream,
    },
  );
  expect(source.textTracks).toBeUndefined();
  expect(plexClient.get).not.toHaveBeenCalled();
  const signal = new AbortController().signal;
  const result = await source.loadTextTracks!(signal);
  if ("error" in result) throw new Error(result.error.message);
  const request = new URL(result.tracks[0].url);
  expect(request.pathname).toBe("/dynproxy/subtitles/:/transcode/universal/start");
  expect(request.searchParams.get("hasMDE")).toBe("1");
  expect(request.searchParams.get("directPlay")).toBe("0");
  expect(request.searchParams.get("protocol")).toBe("http");
  expect(request.searchParams.get("subtitleStreamID")).toBe("6");
  expect(request.searchParams.get("format")).toBe("webvtt");
  expect(request.searchParams.has("maxVideoBitrate")).toBe(false);
  const authorization = new URL((plexClient.get as Mock).mock.calls[0][0], "http://plex");
  expect(authorization.pathname).toBe("/subtitles/:/transcode/universal/decision");
  expect(authorization.searchParams.get("directPlay")).toBe("1");
  expect(plexClient.get).toHaveBeenCalledWith(expect.any(String), signal);
  await releaseMediaPlayback(source);
  expect(
    (fetch as Mock).mock.calls.map(([url]) => new URL(url).searchParams.get("session")),
  ).toEqual(["video-session", "subtitle-session"]);
});

it("reports subtitle authorization failures with HTTP status and owning credentials", async () => {
  const { PlexRequestError } = await import("features/session/model");
  const source = createMediaPlaybackSource(
    metadata,
    version,
    {},
    {
      kind: "original",
      subtitle: { id: 6, languageCode: "eng" } as Plex.Stream,
    },
    { "X-Plex-Token": "owning-profile" },
  );
  (plexClient.get as Mock).mockRejectedValue(new PlexRequestError(403, "Forbidden"));
  expect(await source.loadTextTracks!(new AbortController().signal)).toMatchObject({
    error: { kind: "network", httpStatus: 403 },
  });
  const request = new URL((plexClient.get as Mock).mock.calls[0][0], "http://plex");
  expect(request.searchParams.get("X-Plex-Token")).toBe("owning-profile");
});

it("diagnoses an explicit alternative with cancellation and the captured credentials", async () => {
  const signal = new AbortController().signal;
  const context = { "X-Plex-Token": "owning-profile" };
  await getMediaPlaybackDecision(metadata, version, {}, plan, context, signal);
  const request = new URL((plexClient.get as Mock).mock.calls[0][0], "http://plex");
  expect(request.searchParams.get("X-Plex-Token")).toBe("owning-profile");
  expect(plexClient.get).toHaveBeenCalledWith(expect.any(String), signal);
  const stop = new URL((fetch as Mock).mock.calls[0][0]);
  expect(stop.searchParams.get("X-Plex-Token")).toBe("owning-profile");
  expect(stop.searchParams.get("session")).toBe("session-42");
});

it("releases a diagnostic reservation even when its request fails", async () => {
  (plexClient.get as Mock).mockRejectedValue(new Error("Plex unavailable"));
  await expect(
    getMediaPlaybackDecision(metadata, version, {}, plan, {}, new AbortController().signal),
  ).rejects.toThrow("Plex unavailable");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("stops only the owned session using its credentials during unload", async () => {
  const source = createMediaPlaybackSource(metadata, version, {}, plan, {
    "X-Plex-Token": "owning-profile",
  });
  await releaseMediaPlayback(source, true);
  const request = new URL((fetch as Mock).mock.calls[0][0]);
  expect(request.pathname).toBe("/dynproxy/video/:/transcode/universal/stop");
  expect(request.searchParams.get("X-Plex-Token")).toBe("owning-profile");
  expect(request.searchParams.get("session")).toBe("session-42");
  expect(fetch).toHaveBeenCalledWith(expect.any(String), { keepalive: true });
});
