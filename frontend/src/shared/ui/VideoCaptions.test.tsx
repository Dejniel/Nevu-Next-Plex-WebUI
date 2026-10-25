import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WebVTT } from "videojs-vtt.js";
import VideoCaptions from "./VideoCaptions";

vi.mock("videojs-vtt.js", () => ({ WebVTT: { processCues: vi.fn() } }));
type Cue = VTTCue & { displayState?: HTMLElement };
const makeCue = (text: string, line: number | "auto" = "auto") =>
  ({
    text,
    line,
    vertical: "",
    region: null,
    startTime: 1,
    endTime: 20,
  }) as Cue;

let root: Root;
let host: HTMLDivElement;
let videoRef: React.RefObject<HTMLVideoElement | null>;
let nativeTrack: TextTrack;
let frame: FrameRequestCallback | undefined;
let resize: ResizeObserverCallback;
let disconnect: ReturnType<typeof vi.fn>;
let inset: number;
let height: number;
let hasTrack: boolean;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  inset = 150;
  height = 720;
  hasTrack = true;
  nativeTrack = Object.assign(new EventTarget(), {
    activeCues: [],
  }) as unknown as TextTrack;
  Object.defineProperty(HTMLTrackElement.prototype, "track", {
    configurable: true,
    get: () => nativeTrack,
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        top: 0,
        bottom: height,
        left: 0,
        right: 1280,
        width: 1280,
        height,
      }) as DOMRect,
  );
  disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frame = undefined;
  });
  vi.mocked(WebVTT.processCues).mockImplementation((_window, cues, overlay) => {
    for (const [index, cue] of (cues as Cue[]).entries()) {
      const box = document.createElement("div");
      box.textContent = cue.text;
      box.getBoundingClientRect = () =>
        ({
          top: height - 80 - index * 80,
          bottom: height - 20 - index * 80,
        }) as DOMRect;
      overlay!.append(box);
      cue.displayState = box;
    }
  });
  host = document.createElement("div");
  root = createRoot(host);
  videoRef = createRef<HTMLVideoElement>();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = async () => {
  await act(async () =>
    root.render(
      <>
        <video ref={videoRef}>{hasTrack && <track />}</video>
        <VideoCaptions videoRef={videoRef} bottomInset={inset} />
      </>,
    ),
  );
  await flush();
};
const flush = async () =>
  act(async () => {
    const callback = frame;
    frame = undefined;
    callback?.(0);
  });
const active = (cues: Cue[]) =>
  Object.defineProperty(nativeTrack, "activeCues", {
    configurable: true,
    value: cues,
  });

it("moves multiline dialogue together above controls, preserving authored positions and cue data", async () => {
  const dialogue = makeCue("First line\nSecond line");
  const speaker = makeCue("Another speaker");
  const positioned = makeCue("An intentionally positioned sign", 10);
  active([dialogue, speaker, positioned]);
  await render();
  expect(dialogue.displayState?.style.transform).toBe("translateY(-146px)");
  expect(speaker.displayState?.style.transform).toBe("translateY(-146px)");
  expect(positioned.displayState?.style.transform).toBe("");
  expect(dialogue).toMatchObject({
    line: "auto",
    startTime: 1,
    endTime: 20,
    text: "First line\nSecond line",
  });
  inset = 0;
  await render();
  expect(dialogue.displayState?.style.transform).toBe("");
  expect(host.textContent).toContain("First line\nSecond line");
});

it("renders arriving cues and resizes, then clears removed tracks and their cached DOM", async () => {
  await render();
  const cue = makeCue("Arriving subtitle");
  active([cue]);
  const trackElement = host.querySelector("track")!;
  trackElement.dispatchEvent(new Event("cuechange"));
  await flush();
  expect(host.textContent).toContain("Arriving subtitle");
  height = 390;
  resize([], {} as ResizeObserver);
  await flush();
  expect(WebVTT.processCues).toHaveBeenCalledTimes(3);
  expect(cue.displayState?.style.transform).toBe("translateY(-146px)");
  hasTrack = false;
  await render();
  expect(host.textContent).toBe("");
  expect(cue.displayState).toBeUndefined();
  trackElement.dispatchEvent(new Event("cuechange"));
  expect(frame).toBeUndefined();
});
