import type { Mock } from "vitest";
import { ProxiedRequest } from "shared/api/backend";
import { PlexRequestError } from "shared/api/PlexClient";
import { prepareAudioPlayback, releaseAudioPlayback, pingAudioPlayback } from "./musicPlayback";

const capabilities = vi.hoisted(() => ({ mse: true, hls: true }));
vi.mock("shared/api/backend", () => ({ getBackendURL: () => "http://backend", ProxiedRequest: vi.fn() }));
vi.mock("shared/lib/identifiers", () => ({ uuidV4: () => "audio-session" }));
vi.mock("shared/lib/video/capabilities", () => ({ browserVideoCapabilities: () => ({
  mediaSourceSupported: () => capabilities.mse,
  canPlayType: () => capabilities.hls,
}) }));

const track = { ratingKey: "42", Media: [{ Part: [{ key: "/library/parts/12/file.wma" }] }] } as Plex.Metadata;
const context = { "X-Plex-Token": "captured", session: "old-session" };
function decision(protocol = "dash", codec = "aac", streamType = 2) {
  return { status: 200, data: { MediaContainer: {
    generalDecisionCode: 1001,
    Metadata: [{ Media: [{ selected: true, protocol, Part: [{ selected: true, decision: "transcode", Stream: [
      { streamType, codec, selected: true, decision: "transcode" },
    ] }] }] }],
  } } };
}
const prepare = (converted = true, signal = new AbortController().signal) => prepareAudioPlayback(track, context, converted, signal);
beforeEach(() => {
  vi.resetAllMocks();
  capabilities.mse = true;
  capabilities.hls = true;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  (ProxiedRequest as Mock).mockResolvedValue(decision());
});
afterEach(() => vi.unstubAllGlobals());

it("opens the authenticated original without reserving a conversion session", async () => {
  const source = await prepare(false);
  const url = new URL(source.url);
  expect(source.type).toBe("file");
  expect(url.pathname).toBe("/dynproxy/library/parts/12/file.wma");
  expect(url.searchParams.get("X-Plex-Token")).toBe("captured");
  await releaseAudioPlayback(source);
  await pingAudioPlayback(source);
  expect(ProxiedRequest).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["dash", "hls"])("authorizes %s audio before publishing a source with the same session and parameters", async protocol => {
  capabilities.mse = protocol === "dash";
  (ProxiedRequest as Mock).mockResolvedValue(decision(protocol));
  const signal = new AbortController().signal;
  const source = await prepare(true, signal);
  const request = new URL((ProxiedRequest as Mock).mock.calls[0][0], "http://plex");
  const start = new URL(source.url);
  expect(request.pathname).toBe("/audio/:/transcode/universal/decision");
  expect(start.pathname).toBe(`/dynproxy/audio/:/transcode/universal/start.${protocol === "dash" ? "mpd" : "m3u8"}`);
  expect([...start.searchParams]).toEqual([...request.searchParams]);
  expect(request.searchParams.get("session")).toBe(source.id);
  expect(request.searchParams.get("X-Plex-Session-Identifier")).toBe(source.id);
  expect(request.searchParams.get("directStreamAudio")).toBe("0");
  expect(source.type).toBe(protocol);
  expect(ProxiedRequest).toHaveBeenCalledWith(expect.any(String), "GET", {
    "X-Plex-Token": "captured", accept: "application/json",
  }, undefined, signal);
  await pingAudioPlayback(source);
  await releaseAudioPlayback(source, true);
  for (const [url] of (fetch as Mock).mock.calls) {
    expect(new URL(url).searchParams.get("session")).toBe(source.id);
    expect(new URL(url).searchParams.get("X-Plex-Token")).toBe("captured");
  }
  expect(new URL((fetch as Mock).mock.calls[1][0]).pathname).toBe("/dynproxy/audio/:/transcode/universal/stop");
});

it.each([
  { reason: "missing audio", response: decision("dash", "h264", 1), message: "did not prepare an audio track" },
  { reason: "unsupported codec", response: decision("dash", "ac3"), message: "unsupported audio streaming format" },
  { reason: "different protocol", response: decision("hls"), message: "unsupported streaming format" },
  { reason: "ignored audio", response: { status: 200, data: { MediaContainer: { generalDecisionCode: 1001 } } }, message: "did not prepare an audio track" },
  { reason: "original decision", response: { status: 200, data: { MediaContainer: { generalDecisionCode: 1000 } } }, message: "requested segmented stream" },
  { reason: "refused conversion", response: { status: 200, data: { MediaContainer: { generalDecisionCode: 2000, generalDecisionText: "Server busy", transcodeDecisionCode: 4000 } } }, message: "Server busy" },
])("rejects $reason and releases the reservation", async ({ response, message }) => {
  (ProxiedRequest as Mock).mockResolvedValue(response);
  await expect(prepare()).rejects.toThrow(message);
  expect(fetch).toHaveBeenCalledTimes(1);
  const stop = new URL((fetch as Mock).mock.calls[0][0]);
  expect(stop.pathname).toBe("/dynproxy/audio/:/transcode/universal/stop");
  expect(stop.searchParams.get("X-Plex-Token")).toBe("captured");
});

it("preserves the HTTP refusal without producing a stream", async () => {
  (ProxiedRequest as Mock).mockResolvedValue({ status: 401, data: "Denied" });
  await expect(prepare()).rejects.toBeInstanceOf(PlexRequestError);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("cancels a late decision and retains captured credentials during cleanup", async () => {
  let complete!: (value: unknown) => void;
  (ProxiedRequest as Mock).mockReturnValue(new Promise(resolve => { complete = resolve; }));
  const controller = new AbortController();
  const credentials = { "X-Plex-Token": "owner" };
  const result = prepareAudioPlayback(track, credentials, true, controller.signal);
  credentials["X-Plex-Token"] = "new-profile";
  controller.abort();
  complete(decision());
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(new URL((fetch as Mock).mock.calls[0][0]).searchParams.get("X-Plex-Token")).toBe("owner");
});

it("avoids a request when already cancelled or when streaming is unsupported", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(prepare(true, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  capabilities.mse = capabilities.hls = false;
  await expect(prepare()).rejects.toThrow("does not support Plex audio streaming");
  expect(ProxiedRequest).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
