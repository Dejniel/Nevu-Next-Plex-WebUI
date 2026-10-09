import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAudioPlaybackSource } from "./useAudioPlaybackSource";
import type { AudioSource } from "../api/musicPlayback";

const api = vi.hoisted(() => ({ prepare: vi.fn(), release: vi.fn(), ping: vi.fn() }));
vi.mock("../api/musicPlayback", () => ({
  prepareAudioPlayback: api.prepare, releaseAudioPlayback: api.release, pingAudioPlayback: api.ping,
}));
let root: Root, metadata: Plex.Metadata | null, playbackID: string | null, context: Record<string, unknown>;
let runtime: ReturnType<typeof useAudioPlaybackSource>;
const track = (id: string) => ({ ratingKey: id, Media: [{ Part: [{ key: `/library/parts/${id}/file.wma` }] }] }) as Plex.Metadata;
const source = (id: string, converted: boolean, requestContext = context): AudioSource => ({
  id, type: converted ? "hls" : "file", requestContext, url: "/fixture",
});
function Probe() { runtime = useAudioPlaybackSource(metadata, context, playbackID); return null; }
const render = () => act(async () => { root.render(<Probe />); });
const fail = () => act(async () => {
  runtime.reportError({ sourceId: runtime.source!.id, kind: "unsupported", message: "Codec", position: 17 });
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  metadata = track("1");
  playbackID = "queue/entry";
  context = { "X-Plex-Token": "owner" };
  api.release.mockResolvedValue(undefined);
  api.prepare.mockImplementation(async (item, ctx, converted) => source(`${item.ratingKey}/${converted}`, converted, ctx));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it("publishes conversion only after preparation and handles duplicate failures once", async () => {
  await render();
  let complete!: (source: AudioSource) => void;
  api.prepare.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const original = runtime.source!;
  await act(async () => {
    runtime.reportError({ sourceId: original.id, kind: "media", message: "Decode", position: 17 });
    expect(runtime.reportError({ sourceId: original.id, kind: "media", message: "Duplicate" })).toBe(false);
  });
  expect(runtime.source).toBeNull();
  expect(runtime.startTime).toBe(17);
  expect(api.prepare).toHaveBeenCalledTimes(2);
  await act(async () => complete(source("converted", true)));
  expect(runtime.source?.id).toBe("converted");
  expect(runtime.reportError({ sourceId: original.id, kind: "media", message: "Stale" })).toBe(false);
  await act(async () => { runtime.reportError({ sourceId: "converted", kind: "media", message: "Final" }); });
  expect(runtime.error).toBe("Final");
  expect(runtime.source).toBeNull();
  expect(api.prepare).toHaveBeenCalledTimes(2);
  expect(api.release).toHaveBeenCalledWith(expect.objectContaining({ id: "converted" }), false);
});

it.each(["item", "profile", "queue"])("aborts and releases a late source after a %s change", async change => {
  await render();
  let complete!: (source: AudioSource) => void;
  api.prepare.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  await fail();
  const signal = api.prepare.mock.lastCall![3] as AbortSignal;
  const oldContext = context;
  if (change === "item") metadata = track("2");
  if (change === "profile") context = { "X-Plex-Token": "other" };
  if (change === "queue") playbackID = "other-queue/entry";
  await render();
  const active = runtime.source;
  expect(signal.aborted).toBe(true);
  const late = source("late", true, oldContext);
  await act(async () => complete(late));
  expect(runtime.source).toBe(active);
  expect(runtime.error).toBeNull();
  expect(runtime.startTime).toBe(0);
  expect(api.release).toHaveBeenCalledWith(late);
});

it("retains a source across progress and unrelated metadata refreshes", async () => {
  await render();
  const active = runtime.source;
  metadata = { ...track("1"), title: "Updated title" };
  await render();
  expect(runtime.source).toBe(active);
  expect(api.prepare).toHaveBeenCalledTimes(1);
});

it("releases the previous stream before reserving the next conversion", async () => {
  await render();
  await fail();
  let complete!: () => void;
  api.release.mockReturnValueOnce(new Promise<void>(resolve => { complete = resolve; }));
  metadata = track("2");
  await render();
  expect(api.prepare).toHaveBeenCalledTimes(2);
  await act(async () => complete());
  expect(api.prepare).toHaveBeenCalledTimes(3);
});

it("releases on unload and ignores a response after unmount", async () => {
  await render();
  await fail();
  const active = runtime.source;
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(api.release).toHaveBeenCalledWith(active, true);
  metadata = track("2");
  let complete!: (source: AudioSource) => void;
  api.prepare.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  await render();
  const signal = api.prepare.mock.lastCall![3] as AbortSignal;
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  const late = source("late", true);
  await act(async () => complete(late));
  expect(api.release).toHaveBeenCalledWith(late);
  api.release.mockClear();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(api.release).not.toHaveBeenCalled();
});
