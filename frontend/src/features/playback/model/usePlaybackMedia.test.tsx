import type { Mock } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  type MediaMetadata,
  type MediaStream,
  getMediaMetadata,
  useMediaPlaybackSource,
} from "entities/media/model";
import { putAudioStream, putSubtitleStream } from "../api/playback";
import { downloadSubtitle, uploadSubtitle } from "../api/subtitles";
import type { SubtitleSearchResult } from "./subtitles";
import { usePlaybackMedia } from "./usePlaybackMedia";

const userSettings = vi.hoisted(() => ({ settings: {} as Record<string, string>, setSetting: vi.fn() }));

vi.mock("entities/media/model", async () => ({
  ...(await vi.importActual("entities/media/model/mediaVersions")),
  getMediaMetadata: vi.fn(),
  useMediaPlaybackSource: vi.fn(),
}));
vi.mock("features/settings/model", () => ({
  useUserSettings: { getState: () => userSettings },
}));
vi.mock("../api/playback", () => ({
  putAudioStream: vi.fn(), putSubtitleStream: vi.fn(),
}));
vi.mock("../api/subtitles", () => ({ downloadSubtitle: vi.fn(), uploadSubtitle: vi.fn() }));
vi.mock("./usePlaybackQueue", () => ({ usePlaybackQueue: () => ({ playQueue: null }) }));

let root: Root, itemID: string;
let media: ReturnType<typeof usePlaybackMedia>;
const callbacks = {
  getCurrentTime: vi.fn().mockReturnValue(41),
  onSourceChanging: vi.fn(), requestResumeAt: vi.fn(), setError: vi.fn(),
};
function Harness() {
  media = usePlaybackMedia({ ...callbacks, itemID });
  return null;
}
const render = () => act(async () => root.render(<Harness />));
beforeEach(() => {
  vi.resetAllMocks();
  userSettings.settings = {};
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  itemID = "42";
  localStorage.setItem("quality", "12000");
  callbacks.getCurrentTime.mockReturnValue(41);
  (getMediaMetadata as Mock).mockImplementation(async (id) => ({
    ratingKey: id, type: "movie",
    Media: [{ id: 44, bitrate: 6499, videoCodec: "h264", Part: [{ id: 20, key: "/library/parts/20/file" }] }],
  }));
  (useMediaPlaybackSource as Mock).mockReturnValue({ source: null, error: null, canTryOriginal: true });
});
afterEach(async () => {
  await act(async () => root.unmount());
  localStorage.removeItem("quality");
});

it("uses Original for this playback without refetching metadata, changing tracks or saving quality", async () => {
  await render();
  expect(media.quality).toEqual({ bitrate: 12000 });
  const reads = (getMediaMetadata as Mock).mock.calls.length;
  await act(async () => { expect(media.tryOriginal()).toBe(true); });
  expect(media.quality).toEqual({ bitrate: -1 });
  expect(localStorage.getItem("quality")).toBe("12000");
  expect(getMediaMetadata).toHaveBeenCalledTimes(reads);
  expect(putAudioStream).not.toHaveBeenCalled();
  expect(putSubtitleStream).not.toHaveBeenCalled();
  expect(callbacks.requestResumeAt).not.toHaveBeenCalled();
});

it("restores the saved quality for the next title", async () => {
  await render();
  await act(async () => { media.tryOriginal(); });
  itemID = "43";
  await render();
  expect(media.metadata?.ratingKey).toBe("43");
  expect(media.quality).toEqual({ bitrate: 12000 });
  expect(localStorage.getItem("quality")).toBe("12000");
});

it("still saves an explicit quality selection after temporary Original recovery", async () => {
  await render();
  await act(async () => { media.tryOriginal(); });
  await act(async () => { await media.selectQuality({ bitrate: 8000 }); });
  expect(localStorage.getItem("quality")).toBe("8000");
  expect(callbacks.requestResumeAt).toHaveBeenLastCalledWith(41);
  itemID = "43";
  await render();
  expect(media.quality).toEqual({ bitrate: 8000 });
});

it("keeps Original when an older quality selection finishes late", async () => {
  await render();
  const loaded = media.metadata;
  let complete!: (metadata: MediaMetadata | null) => void;
  (getMediaMetadata as Mock).mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
  let changing!: Promise<void>;
  await act(async () => { changing = media.selectQuality({ bitrate: 8000 }); });
  await act(async () => { media.tryOriginal(); });
  await act(async () => { complete(loaded); await changing; });
  expect(media.quality).toEqual({ bitrate: -1 });
  expect(localStorage.getItem("quality")).toBe("12000");
});

it("does not switch quality when Original recovery is unavailable", async () => {
  (useMediaPlaybackSource as Mock).mockReturnValue({ source: null, error: null, canTryOriginal: false });
  await render();
  await act(async () => { expect(media.tryOriginal()).toBe(false); });
  expect(media.quality).toEqual({ bitrate: 12000 });
});

it("reads metadata once when no track preferences need to be applied", async () => {
  await render();
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
});

it("surfaces a failed metadata request instead of reporting a missing playable file", async () => {
  vi.mocked(getMediaMetadata).mockRejectedValueOnce(new Error("HTTP 403"));
  await render();
  expect(media.metadata).toBeNull();
  expect(callbacks.setError).toHaveBeenLastCalledWith("HTTP 403");
});

it("cancels an old metadata read and ignores its late failure after navigation", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(getMediaMetadata).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  await render();
  const previous = vi.mocked(getMediaMetadata).mock.calls[0][1]!;
  itemID = "43";
  await render();
  await act(async () => reject(new Error("old failure")));
  expect(previous.aborted).toBe(true);
  expect(media.metadata?.ratingKey).toBe("43");
  expect(callbacks.setError).toHaveBeenLastCalledWith(false);
});

it("keeps the previous quality and reports a failed refresh", async () => {
  await render();
  vi.mocked(getMediaMetadata).mockRejectedValueOnce(new Error("HTTP 503"));
  await act(async () => { await media.selectQuality({ bitrate: 8000 }); });
  expect(media.quality).toEqual({ bitrate: 12000 });
  expect(localStorage.getItem("quality")).toBe("12000");
  expect(callbacks.setError).toHaveBeenLastCalledWith("HTTP 503");
});

it("does not reread metadata when automatic matching has no preferences to apply", async () => {
  userSettings.settings.AUTO_MATCH_TRACKS = "true";
  await render();
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
  expect(putAudioStream).not.toHaveBeenCalled();
  expect(putSubtitleStream).not.toHaveBeenCalled();
});

it("rereads metadata after applying an automatic subtitle preference", async () => {
  userSettings.settings = { AUTO_MATCH_TRACKS: "true", "MEDIA_PREF_SUBTITLE-42": JSON.stringify({ index: -1, title: "None" }) };
  await render();
  expect(putSubtitleStream).toHaveBeenCalledWith(20, 0, expect.any(AbortSignal));
  expect(getMediaMetadata).toHaveBeenCalledTimes(2);
  expect(media.metadata?.ratingKey).toBe("42");
});

it("keeps the episode playable when optional series information cannot be read", async () => {
  const read = vi.mocked(getMediaMetadata).getMockImplementation()!;
  vi.mocked(getMediaMetadata).mockImplementation(async (id, signal) => {
    if (id === "9") throw new Error("HTTP 404");
    return { ...await read(id, signal), type: "episode", grandparentRatingKey: "9" };
  });
  await render();
  expect(media.metadata?.ratingKey).toBe("42");
  expect(media.showMetadata).toBeNull();
  expect(callbacks.setError).toHaveBeenLastCalledWith(false);
});

const subtitle = { id: 77, sourceKey: "provider://release", key: "/library/streams/77", streamType: 3, codec: "srt", languageCode: "pol", title: "Example" } satisfies SubtitleSearchResult;

it("can download and select a subtitle after temporary Original recovery", async () => {
  await render();
  await act(async () => { media.tryOriginal(); });
  const version = media.activeVersion!;
  const stream: MediaStream = { ...subtitle, id: 88, key: "/library/streams/88", index: 2, default: false, bitrate: 0, language: "Polish", languageTag: "pl", displayTitle: subtitle.title, extendedDisplayTitle: subtitle.title };
  const attached = { ...media.metadata!, Media: [{ ...version.media, Part: [{ ...version.part, Stream: [stream] }] }] };
  vi.mocked(getMediaMetadata).mockResolvedValue(attached);
  vi.mocked(downloadSubtitle).mockImplementation(async (_id, _mediaID, _subtitle, signal) => signal?.throwIfAborted());
  await act(async () => { await media.downloadOnDemandSubtitle(subtitle); });
  const signal = vi.mocked(downloadSubtitle).mock.calls[0][3]!;
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(signal.aborted).toBe(false);
  expect(putSubtitleStream).toHaveBeenCalledWith(20, 88, expect.any(AbortSignal));
  expect(media.activeVersion?.part.Stream?.[0]).toMatchObject({
    id: 88,
    selected: true,
  });
  expect(media.quality).toEqual({ bitrate: -1 });
});

it("cancels a subtitle download and ignores its late failure after navigation", async () => {
  await render();
  let reject!: (error: Error) => void;
  vi.mocked(downloadSubtitle).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  let downloading!: Promise<void>;
  await act(async () => { downloading = media.downloadOnDemandSubtitle(subtitle); });
  const signal = vi.mocked(downloadSubtitle).mock.calls[0][3]!;
  itemID = "43";
  await render();
  await act(async () => { reject(new Error("old failure")); await expect(downloading).rejects.toMatchObject({ name: "AbortError" }); });
  expect(signal.aborted).toBe(true);
  expect(media.metadata?.ratingKey).toBe("43");
  expect(callbacks.setError).toHaveBeenLastCalledWith(false);
});

it("reports a failed selection to the download UI without cancelling or stopping video", async () => {
  await render();
  const version = media.activeVersion!;
  vi.mocked(getMediaMetadata).mockResolvedValue({
    ...media.metadata!,
    Media: [
      {
        ...version.media,
        Part: [
          {
            ...version.part,
            Stream: [{ ...subtitle, id: 88, key: "/library/streams/88" }],
          },
        ],
      },
    ],
  });
  vi.mocked(putSubtitleStream).mockRejectedValueOnce(new Error("HTTP 400"));
  const changes = callbacks.onSourceChanging.mock.calls.length;
  await act(async () => {
    await expect(media.downloadOnDemandSubtitle(subtitle)).rejects.toThrow(
      "HTTP 400",
    );
  });
  expect(vi.mocked(downloadSubtitle).mock.calls[0][3]?.aborted).toBe(false);
  expect(callbacks.onSourceChanging).toHaveBeenCalledTimes(changes);
  expect(callbacks.requestResumeAt).not.toHaveBeenCalled();
  expect(callbacks.setError).toHaveBeenLastCalledWith(false);
});

it("keeps a rejected subtitle choice as a warning without persisting its preference", async () => {
  const warning = vi.fn();
  (useMediaPlaybackSource as Mock).mockReturnValue({
    source: { id: "current" },
    error: null,
    reportSubtitleError: warning,
  });
  await render();
  const stream = {
    streamType: 3 as const,
    id: 88,
    key: "/library/streams/88",
    codec: "srt",
  };
  vi.mocked(putSubtitleStream).mockRejectedValueOnce(new Error("HTTP 400"));
  await act(async () => {
    expect(
      await media.selectSubtitleTrack({ ...media.activeVersion!, stream }),
    ).toBe(false);
  });
  expect(warning).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceId: "current",
      kind: "subtitle",
      message: "HTTP 400",
    }),
  );
  expect(userSettings.setSetting).not.toHaveBeenCalled();
  expect(callbacks.setError).toHaveBeenLastCalledWith(false);
});

it("rejects an old download callback before it can cancel the next item's operation", async () => {
  await render();
  const staleDownload = media.downloadOnDemandSubtitle;
  itemID = "43";
  await render();
  await expect(staleDownload(subtitle)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(downloadSubtitle).not.toHaveBeenCalled();
  expect(media.metadata?.ratingKey).toBe("43");
});

const uploadedFile = new File(["1\n00:00:01,000 --> 00:00:08,000\nSubtitle"], "Movie.pl.srt");
const withUploadedSubtitle = (metadata: MediaMetadata, id: number): MediaMetadata => ({
  ...metadata,
  Media: metadata.Media?.map((version) => ({
    ...version,
    Part: version.Part?.map((part) => ({
      ...part,
      Stream: [...(part.Stream ?? []), { streamType: 3 as const, id, key: `/library/streams/${id}`, codec: "srt", title: "Movie.pl" }],
    })),
  })),
});

it("uploads and selects a new subtitle using one request without interrupting the video while uploading", async () => {
  await render();
  const before = media.metadata!;
  const attached = withUploadedSubtitle(before, 88);
  let finish!: () => void;
  vi.mocked(uploadSubtitle).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  vi.mocked(getMediaMetadata).mockResolvedValueOnce(before).mockResolvedValue(attached);
  const changes = callbacks.onSourceChanging.mock.calls.length;
  let uploading!: Promise<void>;
  await act(async () => { uploading = media.uploadSubtitleFile(uploadedFile); });
  expect(callbacks.onSourceChanging).toHaveBeenCalledTimes(changes);
  callbacks.getCurrentTime.mockReturnValue(49);
  await act(async () => { finish(); await uploading; });
  const signal = vi.mocked(uploadSubtitle).mock.calls[0][3]!;
  expect(uploadSubtitle).toHaveBeenCalledWith("42", 44, uploadedFile, signal);
  expect(signal.aborted).toBe(false);
  expect(putSubtitleStream).toHaveBeenCalledWith(20, 88, signal);
  expect(media.subtitleChoices.find((choice) => choice.stream.id === 88)?.stream.selected).toBe(true);
  expect(callbacks.requestResumeAt).toHaveBeenLastCalledWith(49);
  expect(userSettings.setSetting).toHaveBeenCalledWith("MEDIA_PREF_SUBTITLE-42", expect.stringContaining("Movie.pl"));
});

it("can retry the same filename after attachment succeeded but selection failed", async () => {
  await render();
  const initial = media.metadata!;
  const first = withUploadedSubtitle(initial, 88);
  const second = withUploadedSubtitle(first, 89);
  vi.mocked(getMediaMetadata).mockResolvedValueOnce(initial).mockResolvedValueOnce(first);
  vi.mocked(putSubtitleStream).mockRejectedValueOnce(new Error("HTTP 400"));
  await act(async () => { await expect(media.uploadSubtitleFile(uploadedFile)).rejects.toThrow("HTTP 400"); });
  expect(userSettings.setSetting).not.toHaveBeenCalled();
  vi.mocked(getMediaMetadata).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await act(async () => { await media.uploadSubtitleFile(uploadedFile); });
  expect(putSubtitleStream).toHaveBeenLastCalledWith(20, 89, expect.any(AbortSignal));
  expect(media.subtitleChoices.find((choice) => choice.stream.id === 89)?.stream.selected).toBe(true);
});

it("cancels an upload after navigation and prevents late attachment or selection", async () => {
  await render();
  let finish!: () => void;
  vi.mocked(uploadSubtitle).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let uploading!: Promise<void>;
  await act(async () => { uploading = media.uploadSubtitleFile(uploadedFile); });
  const signal = vi.mocked(uploadSubtitle).mock.calls[0][3]!;
  itemID = "43";
  await render();
  await act(async () => { finish(); await expect(uploading).rejects.toMatchObject({ name: "AbortError" }); });
  expect(signal.aborted).toBe(true);
  expect(putSubtitleStream).not.toHaveBeenCalled();
  expect(media.metadata?.ratingKey).toBe("43");
});
