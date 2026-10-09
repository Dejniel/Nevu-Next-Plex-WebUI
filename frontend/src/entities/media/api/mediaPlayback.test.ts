import type { MediaMetadata, MediaStream } from "plex/media";
import type { Mock } from "vitest";
import { ProxiedRequest } from "shared/api/backend";
import { PlexRequestError } from "shared/api/PlexClient";
import {
  prepareMediaPlayback,
  releaseMediaPlayback,
  pingMediaPlayback,
} from "./mediaPlayback";
import type { MediaVersion } from "../model/mediaVersions";
import { planMediaPlayback } from "../model/mediaPlayback";
import type { PlexPlaybackPlan } from "../model/mediaPlayback";
import { uuidV4 } from "shared/lib/identifiers";

vi.mock("shared/api/backend", () => ({
  getBackendURL: () => "http://backend",
  ProxiedRequest: vi.fn(),
}));
vi.mock("shared/lib/identifiers", () => ({ uuidV4: vi.fn() }));
const version = {
  mediaIndex: 2,
  partIndex: 1,
  media: { videoCodec: "h264", audioCodec: "aac", container: "mkv" },
  part: {
    key: "/library/parts/20/file.mkv",
    Stream: [{ streamType: 2, id: 4, selected: true }],
  },
} as MediaVersion;
const metadata = { ratingKey: "42" } as MediaMetadata;
const request: PlexPlaybackPlan = {
  protocol: "dash",
  copyVideo: true,
  copyAudio: true,
  videoCodec: "h264",
  audioCodec: "aac",
  subtitles: "none",
};
const context = { "X-Plex-Token": "owning-profile" };
const prepare = (options = request, quality = {}, signal = new AbortController().signal) =>
  prepareMediaPlayback(metadata, version, quality, options, context, signal);
const decisionRequest = () => new URL((ProxiedRequest as Mock).mock.calls[0][0], "http://plex");

function decision(video = "copy", audio = "copy", protocol = "dash", videoCodec = "h264") {
  return {
    status: 200,
    data: {
      MediaContainer: {
        generalDecisionCode: 1001,
        Metadata: [{ Media: [{ protocol, Part: [{ Stream: [
          { streamType: 1, codec: videoCodec, decision: video },
          { streamType: 2, codec: "aac", decision: audio, selected: true },
        ] }] }] }],
      },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  (uuidV4 as Mock).mockReturnValue("session-42");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  (ProxiedRequest as Mock).mockResolvedValue(decision());
});
afterEach(() => vi.unstubAllGlobals());

it("prepares and starts a stream with the same session and identical parameters", async () => {
  const signal = new AbortController().signal;
  const { source } = await prepare(request, { bitrate: -1 }, signal);
  const start = new URL(source.url),
    decision = decisionRequest();
  expect(decision.pathname).toBe("/video/:/transcode/universal/decision");
  expect(start.pathname).toBe("/dynproxy/video/:/transcode/universal/start.mpd");
  expect([...start.searchParams]).toEqual([...decision.searchParams]);
  expect(start.searchParams.get("mediaIndex")).toBe("2");
  expect(start.searchParams.get("partIndex")).toBe("1");
  expect(start.searchParams.get("audioStreamID")).toBe("4");
  expect(start.searchParams.get("directPlay")).toBe("0");
  expect(start.searchParams.get("directStream")).toBe("1");
  expect(start.searchParams.get("fastSeek")).toBe("0");
  expect(start.searchParams.get("secondsPerSegment")).toBe("8");
  expect(start.searchParams.has("maxVideoBitrate")).toBe(false);
  expect(source).toMatchObject({
    id: "session-42",
    type: "dash",
    stripSegmentInitialization: true,
    seekPreRoll: 16,
  });
  expect(ProxiedRequest).toHaveBeenCalledWith(
    expect.any(String),
    "GET",
    {
      "X-Plex-Token": "owning-profile",
      accept: "application/json",
    },
    undefined,
    signal,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects an unexpected Direct Play decision without exposing the original URL", async () => {
  (ProxiedRequest as Mock).mockResolvedValue({
    status: 200,
    data: { MediaContainer: { generalDecisionCode: 1000 } },
  });
  await expect(prepare()).rejects.toThrow("did not prepare the requested segmented stream");
  const params = decisionRequest().searchParams;
  expect(params.get("directPlay")).toBe("0");
  expect(params.get("X-Plex-Client-Profile-Extra")).not.toContain("add-direct-play-profile");
  expect(new URL((fetch as Mock).mock.calls[0][0]).pathname).toBe(
    "/dynproxy/video/:/transcode/universal/stop",
  );
});
it("keeps quality and HLS conversion choices in preparation and start", async () => {
  (ProxiedRequest as Mock).mockResolvedValue(decision("transcode", "transcode", "hls"));
  const { source } = await prepare(
    {
      ...request,
      protocol: "hls",
      copyVideo: false,
      copyAudio: false,
    },
    { bitrate: 240 },
  );
  const start = new URL(source.url);
  expect(start.pathname).toBe("/dynproxy/video/:/transcode/universal/start.m3u8");
  expect(start.searchParams.get("maxVideoBitrate")).toBe("240");
  expect(start.searchParams.get("directStream")).toBe("0");
  expect(start.searchParams.get("directStreamAudio")).toBe("0");
  expect(start.searchParams.has("secondsPerSegment")).toBe(false);
  expect(source.stripSegmentInitialization).toBe(false);
});
it("requests H264 conversion for a quality preset above the HEVC source bitrate", async () => {
  const sample = {
    ...version,
    media: { ...version.media, videoCodec: "hevc", bitrate: 6499 },
  };
  const quality = { bitrate: 12000 };
  const requestedPlan = await planMediaPlayback(sample, quality, "initial", {
    canPlayType: () => true,
    mediaSourceSupported: () => true,
  });
  (ProxiedRequest as Mock).mockResolvedValue(decision("transcode"));
  const { source, plan } = await prepareMediaPlayback(
    metadata, sample, quality, requestedPlan, context, new AbortController().signal,
  );
  const params = decisionRequest().searchParams;
  expect(params.get("directStream")).toBe("0");
  expect(params.get("maxVideoBitrate")).toBe("12000");
  expect(params.get("X-Plex-Client-Profile-Extra")).toContain("videoCodec=h264");
  expect([...new URL(source.url).searchParams]).toEqual([...params]);
  expect(plan).toMatchObject({ videoCodec: "h264", copyVideo: false, copyAudio: true });
  expect(source.seekPreRoll).toBeUndefined();
});
it("releases a successful audio-only decision without publishing a playable source", async () => {
  (ProxiedRequest as Mock).mockResolvedValue(decision("ignore", "copy", "dash", "hevc"));
  await expect(prepare({ ...request, videoCodec: "hevc" })).rejects.toThrow(
    "did not prepare a video track",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  const stop = new URL((fetch as Mock).mock.calls[0][0]);
  expect(stop.pathname).toBe("/dynproxy/video/:/transcode/universal/stop");
  expect(stop.searchParams.get("session")).toBe("session-42");
});
it("reserves independent lazy subtitle extraction after video preparation", async () => {
  (uuidV4 as Mock).mockReturnValueOnce("video-session").mockReturnValueOnce("subtitle-session");
  const { source } = await prepare(
    {
      ...request,
      subtitles: "sidecar",
      subtitle: { id: 6, languageCode: "eng" } as MediaStream,
    },
    { bitrate: 240 },
  );
  expect(source.textTracks).toBeUndefined();
  expect(ProxiedRequest).toHaveBeenCalledTimes(1);
  const result = await source.loadTextTracks!(new AbortController().signal);
  if ("error" in result) throw new Error(result.error.message);
  const start = new URL(result.tracks[0].url);
  expect(start.pathname).toBe("/dynproxy/subtitles/:/transcode/universal/start");
  expect(start.searchParams.get("session")).toBe("subtitle-session");
  expect(start.searchParams.get("subtitleStreamID")).toBe("6");
  expect(start.searchParams.get("format")).toBe("webvtt");
  expect(start.searchParams.has("maxVideoBitrate")).toBe(false);
  const authorization = new URL((ProxiedRequest as Mock).mock.calls[1][0], "http://plex");
  expect(authorization.pathname).toBe("/subtitles/:/transcode/universal/decision");
  expect(authorization.searchParams.get("session")).toBe("subtitle-session");
  await releaseMediaPlayback(source);
  expect(
    (fetch as Mock).mock.calls.map(([url]) => new URL(url).searchParams.get("session")),
  ).toEqual(["video-session", "subtitle-session"]);
});
it("keeps subtitle HTTP failures separate from video failure", async () => {
  const { source } = await prepare({
    ...request,
    subtitles: "sidecar",
    subtitle: { id: 6 } as MediaStream,
  });
  (ProxiedRequest as Mock).mockResolvedValue({
    status: 403,
    data: "Forbidden",
  });
  expect(await source.loadTextTracks!(new AbortController().signal)).toMatchObject({
    error: { kind: "subtitle", httpStatus: 403 },
  });
  expect((ProxiedRequest as Mock).mock.lastCall?.[2]["X-Plex-Token"]).toBe("owning-profile");
});
it("cleans its reservation on a decision refusal without producing a source", async () => {
  (ProxiedRequest as Mock).mockResolvedValue({
    status: 200,
    data: {
      MediaContainer: {
        generalDecisionCode: 2000,
        generalDecisionText: "Playback denied.",
      },
    },
  });
  await expect(prepare()).rejects.toThrow("Playback denied.");
  expect(new URL((fetch as Mock).mock.calls[0][0]).searchParams.get("session")).toBe("session-42");
});

it("cleans its reservation when the decision's negotiated streams are malformed", async () => {
  (ProxiedRequest as Mock).mockResolvedValue({ status: 200, data: {
    MediaContainer: { generalDecisionCode: 1001, Metadata: [{ Media: [{ Part: [{ Stream: {} }] }] }] },
  } });
  await expect(prepare()).rejects.toThrow("invalid playback decision");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(new URL((fetch as Mock).mock.calls[0][0]).searchParams.get("session")).toBe("session-42");
});
it("retains HTTP errors and captured credentials when preparation fails", async () => {
  (ProxiedRequest as Mock).mockResolvedValue({
    status: 403,
    data: "Forbidden",
  });
  await expect(prepare()).rejects.toBeInstanceOf(PlexRequestError);
  expect(new URL((fetch as Mock).mock.calls[0][0]).searchParams.get("X-Plex-Token")).toBe(
    "owning-profile",
  );
});
it("releases a late decision after cancellation instead of publishing a source", async () => {
  let complete!: (response: unknown) => void;
  (ProxiedRequest as Mock).mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const controller = new AbortController();
  const result = prepare(request, {}, controller.signal);
  controller.abort();
  complete({
    status: 200,
    data: { MediaContainer: { generalDecisionCode: 1001 } },
  });
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not reserve a session when already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(prepare(request, {}, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(ProxiedRequest).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("releases its stream session and retains unload credentials", async () => {
  const { source } = await prepare();
  await releaseMediaPlayback(source, true);
  const stop = new URL((fetch as Mock).mock.calls[0][0]);
  expect(stop.pathname).toBe("/dynproxy/video/:/transcode/universal/stop");
  expect(stop.searchParams.get("X-Plex-Token")).toBe("owning-profile");
  expect(stop.searchParams.get("session")).toBe("session-42");
  expect(fetch).toHaveBeenCalledWith(expect.any(String), {
    keepalive: true,
    signal: expect.any(AbortSignal),
  });
});

it("pings the source's owning session", async () => {
  const { source } = await prepare();
  await pingMediaPlayback(source);
  const ping = new URL((fetch as Mock).mock.calls[0][0]);
  expect(ping.pathname).toBe("/dynproxy/video/:/transcode/universal/ping");
  expect(ping.searchParams.get("session")).toBe(source.id);
  expect(ping.searchParams.get("X-Plex-Token")).toBe("owning-profile");
});
