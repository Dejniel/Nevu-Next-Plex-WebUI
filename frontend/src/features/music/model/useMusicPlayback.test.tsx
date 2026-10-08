import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { useMusicPlayback } from "./useMusicPlayback";
const mocks = vi.hoisted(() => ({
  pause: vi.fn(),
  error: vi.fn(),
  release: vi.fn(),
  source: vi.fn(),
  timeline: vi.fn(),
  rememberPosition: vi.fn(),
  busy: false,
  step: vi.fn(),
  entryID: 100,
  startTime: 0,
  context: {},
  track: { ratingKey: "10", type: "track", title: "Track", duration: 60000 },
}));
vi.mock("./MusicProvider", () => ({
  useMusic: () => ({
    session: {
      entryID: mocks.entryID,
      queueID: 1,
      playing: true,
      startTime: mocks.startTime,
    },
    track: mocks.track,
    context: mocks.context,
    pause: mocks.pause,
    setError: mocks.error,
    api: { timeline: mocks.timeline },
    rememberPosition: mocks.rememberPosition,
    busy: mocks.busy,
    step: mocks.step,
  }),
}));
vi.mock("../api/musicPlayback", () => ({
  prepareAudioPlayback: mocks.source,
  releaseAudioPlayback: mocks.release,
  pingAudioPlayback: vi.fn(),
}));
let root: Root, runtime: ReturnType<typeof useMusicPlayback>;
function Probe() {
  runtime = useMusicPlayback();
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.pause.mockClear();
  mocks.rememberPosition.mockClear();
  mocks.startTime = 0;
  mocks.busy = false;
  mocks.entryID = 100;
  mocks.step.mockClear();
  mocks.error.mockClear();
  mocks.release.mockReset();
  mocks.release.mockResolvedValue(undefined);
  mocks.source.mockClear();
  mocks.source.mockImplementation(async (_item, _context, converted) => ({
    id: converted ? "converted" : "original",
    type: converted ? "dash" : "file",
    requestContext: {},
    url: "/test",
  }));
  root = createRoot(document.createElement("div"));
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
it("uses one Plex conversion after a decoder failure and retains the position", async () => {
  await act(async () =>
    runtime.onError({
      sourceId: "original",
      kind: "unsupported",
      message: "Format",
      position: 47,
    }),
  );
  expect(runtime.source?.id).toBe("converted");
  expect(runtime.startTime).toBe(47);
  expect(mocks.release).toHaveBeenCalledWith(
    expect.objectContaining({ id: "original" }),
    false,
  );
  await act(async () =>
    runtime.onError({ sourceId: "original", kind: "media", message: "Old" }),
  );
  expect(mocks.error).not.toHaveBeenCalled();
  await act(async () =>
    runtime.onError({
      sourceId: "converted",
      kind: "media",
      message: "Decoder refused",
    }),
  );
  expect(mocks.error).toHaveBeenCalledWith("Decoder refused");
  expect(mocks.pause).toHaveBeenCalled();
});
it("reports an access or network failure without requesting conversion", async () => {
  await act(async () =>
    runtime.onError({
      sourceId: "original",
      kind: "network",
      message: "Forbidden",
      httpStatus: 403,
    }),
  );
  expect(runtime.source).toBeNull();
  expect(mocks.error).toHaveBeenCalledWith("Forbidden");
});

it("keeps supported OS controls when the browser rejects an optional action", async () => {
  await act(async () => root.render(null));
  const setActionHandler = vi.fn((action, handler) => {
    if (action === "seekto" && handler)
      throw new DOMException("Unsupported action", "NotSupportedError");
  });
  const session = { metadata: null, playbackState: "none", setActionHandler };
  vi.stubGlobal("navigator", { mediaSession: session });
  vi.stubGlobal(
    "MediaMetadata",
    class {
      constructor(values: object) {
        Object.assign(this, values);
      }
    },
  );
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    ),
  );
  expect(session.metadata).toMatchObject({ title: "Track" });
  expect(setActionHandler).toHaveBeenCalledWith("play", expect.any(Function));
  expect(setActionHandler).toHaveBeenCalledWith(
    "nexttrack",
    expect.any(Function),
  );
  await act(async () => root.render(null));
  expect(setActionHandler).toHaveBeenCalledWith("play", null);
  expect(setActionHandler).not.toHaveBeenCalledWith("seekto", null);
  expect(session.metadata).toBeNull();
});

it("restores a paused source at its checkpoint and records progress and OS/UI seeks in one path", async () => {
  await act(async () => root.render(null));
  mocks.startTime = 17;
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    ),
  );
  expect(runtime.startTime).toBe(17);
  expect(runtime.position).toBe(17);
  await act(async () =>
    runtime.onProgress({ playedSeconds: 18, loadedSeconds: 20 }),
  );
  expect(mocks.rememberPosition).toHaveBeenLastCalledWith(100, 18);
  runtime.player.current = {
    seekTo: vi.fn(),
    getCurrentTime: () => 18,
    getDuration: () => 60,
  };
  await act(async () => runtime.seek(23));
  expect(runtime.player.current.seekTo).toHaveBeenCalledWith(23);
  expect(runtime.position).toBe(23);
  expect(mocks.rememberPosition).toHaveBeenLastCalledWith(100, 23);
  expect(mocks.source).toHaveBeenCalledTimes(2);
});

it("advances exactly once when a song ends during a queue edit", async () => {
  mocks.busy = true;
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    ),
  );
  await act(async () => runtime.onEnded());
  expect(mocks.step).not.toHaveBeenCalled();
  mocks.busy = false;
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    ),
  );
  expect(mocks.step).toHaveBeenCalledExactlyOnceWith(1);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    ),
  );
  expect(mocks.step).toHaveBeenCalledTimes(1);
});

it("discards deferred advancement when queue editing replaces the ended song", async () => {
  mocks.busy = true;
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    ),
  );
  await act(async () => runtime.onEnded());
  mocks.entryID = 101;
  mocks.busy = false;
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    ),
  );
  expect(mocks.step).not.toHaveBeenCalled();
  mocks.entryID = 100;
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    ),
  );
  expect(mocks.step).not.toHaveBeenCalled();
});
