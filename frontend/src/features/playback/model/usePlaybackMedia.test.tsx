import type { Mock } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMediaPlaybackSource } from "entities/media/model";
import { getPlaybackMetadata, putAudioStream, putSubtitleStream } from "../api/playback";
import { usePlaybackMedia } from "./usePlaybackMedia";

vi.mock("entities/media/model", async () => ({
  ...(await vi.importActual("entities/media/model/mediaVersions")),
  useMediaPlaybackSource: vi.fn(),
}));
vi.mock("features/settings/model", () => ({
  useUserSettings: { getState: () => ({ settings: {} }) },
}));
vi.mock("../api/playback", () => ({
  getPlaybackMetadata: vi.fn(), putAudioStream: vi.fn(), putSubtitleStream: vi.fn(),
}));
vi.mock("../api/subtitles", () => ({ downloadSubtitle: vi.fn() }));
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
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  itemID = "42";
  localStorage.setItem("quality", "12000");
  callbacks.getCurrentTime.mockReturnValue(41);
  (getPlaybackMetadata as Mock).mockImplementation(async (id) => ({
    ratingKey: id, type: "movie",
    Media: [{ bitrate: 6499, videoCodec: "h264", Part: [{ id: 20, key: "/library/parts/20/file" }] }],
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
  const reads = (getPlaybackMetadata as Mock).mock.calls.length;
  await act(async () => { expect(media.tryOriginal()).toBe(true); });
  expect(media.quality).toEqual({ bitrate: -1 });
  expect(localStorage.getItem("quality")).toBe("12000");
  expect(getPlaybackMetadata).toHaveBeenCalledTimes(reads);
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
  let complete!: (metadata: Plex.Metadata | null) => void;
  (getPlaybackMetadata as Mock).mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
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
