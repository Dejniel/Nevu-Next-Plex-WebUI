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
}));
vi.mock("./MusicProvider", () => ({
  useMusic: () => ({
    session: { entryID: 100, queueID: 1, playing: true },
    track: { ratingKey: "10", type: "track", title: "Track", duration: 60000 },
    context: {},
    pause: mocks.pause,
    setError: mocks.error,
    api: { timeline: mocks.timeline },
  }),
}));
vi.mock("../api/music", () => ({
  audioSource: mocks.source,
  releaseAudioSource: mocks.release,
  pingAudioSource: vi.fn(),
}));
let root: Root, runtime: ReturnType<typeof useMusicPlayback>;
function Probe() {
  runtime = useMusicPlayback();
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.pause.mockClear();
  mocks.error.mockClear();
  mocks.release.mockClear();
  mocks.source.mockClear();
  mocks.source.mockImplementation((_item, _context, converted) => ({
    id: converted ? "converted" : "original",
    type: converted ? "dash" : "file",
    context: {},
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
  expect(runtime.source?.id).toBe("original");
  expect(mocks.error).toHaveBeenCalledWith("Forbidden");
});

it("keeps supported OS controls when the browser rejects an optional action", async () => {
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
