import type { Mock } from "vitest";
import { plexClient } from "features/session/model";
import { planMediaPlayback } from "../model/mediaPlayback";
import { resolveMediaPlayback, releaseMediaPlayback } from "./mediaPlayback";
import type { MediaVersion } from "../model/mediaVersions";
import { uuidV4 } from "shared/lib/identifiers";

vi.mock("features/session/model", () => ({
  getXPlexProps: () => ({ "X-Plex-Token": "fixture" }),
  plexClient: { get: vi.fn() },
}));
vi.mock("shared/api/backend", () => ({
  getBackendURL: () => "http://backend",
}));
vi.mock("shared/lib/identifiers", () => ({ uuidV4: vi.fn() }));
vi.mock("../model/mediaPlayback", async () => ({
  ...(await vi.importActual<typeof import("../model/mediaPlayback")>(
    "../model/mediaPlayback",
  )),
  planMediaPlayback: vi.fn(),
}));
const version = {
  mediaIndex: 2,
  partIndex: 1,
  media: { videoCodec: "h264", audioCodec: "aac", container: "mkv" },
  part: { key: "/library/parts/20/file.mkv" },
} as MediaVersion;
const metadata = { ratingKey: "42" } as Plex.Metadata;

beforeEach(() => {
  vi.resetAllMocks();
  (uuidV4 as Mock).mockReturnValue("session-42");
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  (planMediaPlayback as Mock).mockResolvedValue({
    protocol: "dash",
    directPlay: false,
    copyVideo: true,
    copyAudio: true,
    subtitles: "none",
    profile: "fixture-profile",
  });
  (plexClient.get as Mock).mockResolvedValue({
    MediaContainer: { generalDecisionCode: 1001, directPlayDecisionCode: 3000 },
  });
});

it("negotiates Original and uses the selected file indexes for remuxing", async () => {
  const source = await resolveMediaPlayback(metadata, { bitrate: -1 }, version);
  const request = new URL(
    (plexClient.get as Mock).mock.calls[0][0],
    "http://plex",
  );
  expect(request.searchParams.get("mediaIndex")).toBe("2");
  expect(request.searchParams.get("partIndex")).toBe("1");
  expect(request.searchParams.has("maxVideoBitrate")).toBe(false);
  expect(request.searchParams.get("X-Plex-Client-Profile-Name")).toBe(
    "Generic",
  );
  expect(source).toMatchObject({
    mode: "remux",
    type: "dash",
    sessionID: "session-42",
  });
  expect(source.url).toContain("/start.mpd?");
});

it("uses a raw file only when Plex approves direct play", async () => {
  (planMediaPlayback as Mock).mockResolvedValue({
    protocol: "dash",
    directPlay: true,
    copyVideo: true,
    copyAudio: true,
    subtitles: "none",
    profile: "fixture-profile",
  });
  (plexClient.get as Mock).mockResolvedValue({
    MediaContainer: { generalDecisionCode: 1000, directPlayDecisionCode: 1000 },
  });
  const source = await resolveMediaPlayback(metadata, {}, version);
  expect(source).toMatchObject({
    mode: "directplay",
    type: "file",
    sessionID: undefined,
  });
  expect(source.url).toContain("/library/parts/20/file.mkv?");
});

it("propagates negotiation failures without starting a stream", async () => {
  (plexClient.get as Mock).mockRejectedValue(new Error("Plex unavailable"));
  await expect(resolveMediaPlayback(metadata, {}, version)).rejects.toThrow(
    "Plex unavailable",
  );
});

it("stops the exact transcode session owned by the source", async () => {
  const source = await resolveMediaPlayback(metadata, {}, version);
  await releaseMediaPlayback(source);
  const stop = new URL((fetch as Mock).mock.calls[0][0], "http://plex");
  expect(stop.pathname).toBe("/dynproxy/video/:/transcode/universal/stop");
  expect(stop.searchParams.get("session")).toBe("session-42");
  expect(stop.searchParams.get("X-Plex-Session-Identifier")).toBe("session-42");
});

it("authorizes text extraction and starts a subtitle-only HTTP stream", async () => {
  (uuidV4 as Mock)
    .mockReturnValueOnce("video-session")
    .mockReturnValueOnce("subtitle-session");
  (planMediaPlayback as Mock).mockResolvedValue({
    protocol: "dash",
    directPlay: false,
    copyVideo: true,
    copyAudio: true,
    subtitles: "sidecar",
    subtitle: { id: 6, languageCode: "eng" },
    profile: "fixture-profile",
  });
  const source = await resolveMediaPlayback(
    metadata,
    { bitrate: 240 },
    version,
  );
  expect(plexClient.get).toHaveBeenCalledTimes(2);
  const authorization = new URL(
    (plexClient.get as Mock).mock.calls[1][0],
    "http://plex",
  );
  expect(authorization.searchParams.get("hasMDE")).toBe("1");
  expect(authorization.searchParams.get("directPlay")).toBe("1");
  expect(authorization.searchParams.has("maxVideoBitrate")).toBe(false);
  const track = new URL(source.textTracks![0].url);
  expect(track.pathname).toBe(
    "/dynproxy/subtitles/:/transcode/universal/start",
  );
  expect(track.searchParams.get("protocol")).toBe("http");
  expect(track.searchParams.get("subtitleStreamID")).toBe("6");
  expect(track.searchParams.get("directStream")).toBe("1");
  expect(source.sessionID).toBe("video-session");
  expect(source.subtitleSessionID).toBe("subtitle-session");
  await releaseMediaPlayback(source);
  expect(
    (fetch as Mock).mock.calls.map(([url]) =>
      new URL(url).searchParams.get("session"),
    ),
  ).toEqual(["video-session", "subtitle-session"]);
});

it("keeps the owning request context and can stop during page unload", async () => {
  await releaseMediaPlayback(
    {
      id: "owned",
      type: "dash",
      url: "/stream",
      mode: "remux",
      sessionID: "owned-session",
      requestContext: { "X-Plex-Token": "owning-profile" },
    },
    true,
  );
  const request = new URL((fetch as Mock).mock.calls[0][0]);
  expect(request.searchParams.get("X-Plex-Token")).toBe("owning-profile");
  expect(request.searchParams.get("session")).toBe("owned-session");
  expect(fetch).toHaveBeenCalledWith(expect.any(String), { keepalive: true });
});
