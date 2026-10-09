import type { MediaMetadata } from "plex/media";
import type { Mock } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  prepareMediaPlayback,
  releaseMediaPlayback,
} from "../api/mediaPlayback";
import { planMediaPlayback } from "./mediaPlayback";
import { PlexPlaybackRefusal } from "shared/api/plexPlayback";
import { PlexRequestError } from "shared/api/PlexClient";
import type {
  PlexPlaybackPlan,
  PlexPlaybackSource,
  MediaPlaybackQuality,
} from "./mediaPlayback";
import { useMediaPlaybackSource } from "./useMediaPlaybackSource";
import type { VideoPlaybackError } from "shared/lib/video/types";

const session = vi.hoisted(() => ({
  scope: { serverId: "server", profileKey: "owner" },
  revision: 0,
  token: "owner",
}));
vi.mock("features/session/model", async () => ({
  PlexRequestError: (await import("shared/api/PlexClient")).PlexRequestError,
  getXPlexProps: () => ({ "X-Plex-Token": session.token }),
  useActiveServerScope: () => session.scope,
  getActiveServerScope: () => session.scope,
  useAuthSession: Object.assign(
    (selector: (state: typeof session) => unknown) => selector(session),
    { getState: () => session },
  ),
}));
vi.mock("../api/mediaPlayback", () => ({
  prepareMediaPlayback: vi.fn(),
  releaseMediaPlayback: vi.fn(),
}));
vi.mock("./mediaPlayback", async () => ({
  ...(await vi.importActual<typeof import("./mediaPlayback")>("./mediaPlayback")),
  planMediaPlayback: vi.fn(),
}));
const stream: PlexPlaybackPlan = {
  protocol: "dash",
  copyVideo: true,
  copyAudio: true,
  videoCodec: "h264",
  audioCodec: "aac",
  subtitles: "none",
};
const converted: PlexPlaybackPlan = {
  ...stream,
  copyVideo: false,
  copyAudio: false,
};
function movie(id = "1"): MediaMetadata {
  return {
    ratingKey: id,
    Media: [
      {
        bitrate: 10000,
        videoCodec: "h264",
        audioCodec: "aac",
        Part: [
          {
            key: `/library/parts/${id}/file.mp4`,
            Stream: [{ id: 2, streamType: 2, codec: "aac", selected: true }],
          },
        ],
      },
    ],
  } as MediaMetadata;
}
let root: Root, metadata: MediaMetadata | null, quality: MediaPlaybackQuality;
let state: ReturnType<typeof useMediaPlaybackSource>, sequence: number;
function Harness() {
  state = useMediaPlaybackSource(metadata, undefined, quality);
  return null;
}
const render = () =>
  act(async () => {
    root.render(<Harness />);
  });
const fail = (failure: VideoPlaybackError = { kind: "media", message: "Decode failed" }) =>
  act(async () => {
    state.reportError({ ...failure, sourceId: state.source!.id });
  });
function prepared(plan: PlexPlaybackPlan, context = { "X-Plex-Token": "owner" }) {
  return {
    plan,
    source: {
      id: `source-${++sequence}`,
      type: plan.protocol,
      url: "/media",
      requestContext: context,
    } satisfies PlexPlaybackSource,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  session.scope = { serverId: "server", profileKey: "owner" };
  session.revision = 0;
  session.token = "owner";
  root = createRoot(document.createElement("div"));
  metadata = movie();
  quality = {};
  sequence = 0;
  (releaseMediaPlayback as Mock).mockResolvedValue(undefined);
  (planMediaPlayback as Mock).mockImplementation(async (_version, _quality, intent) =>
    intent === "compatible" ? converted : stream,
  );
  (prepareMediaPlayback as Mock).mockImplementation(
    async (_metadata, _version, _quality, plan: PlexPlaybackPlan, context) =>
      prepared(plan, context),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("negotiates before publishing a stream, then accepts only its readiness event", async () => {
  await render();
  expect(planMediaPlayback).toHaveBeenCalledWith(expect.anything(), {}, "initial");
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(1);
  expect(state.source?.type).toBe("dash");
  expect(state.loading).toBe(true);
  expect(state.reportReady("stale")).toBe(false);
  await act(async () => {
    expect(state.reportReady(state.source!.id)).toBe(true);
  });
  expect(state.loading).toBe(false);
});
it("publishes negotiated HLS through the same lifecycle", async () => {
  (planMediaPlayback as Mock).mockResolvedValue({ ...stream, protocol: "hls" });
  await render();
  expect(state.source?.type).toBe("hls");
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(1);
});
it("renegotiates one compatible fallback after an actual decoder failure", async () => {
  await render();
  const first = state.source;
  await fail();
  expect(state.source?.type).toBe("dash");
  expect(planMediaPlayback).toHaveBeenLastCalledWith(expect.anything(), {}, "compatible");
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(2);
  expect(releaseMediaPlayback).toHaveBeenCalledWith(first);
  await fail({ kind: "media", message: "Final decode failure" });
  expect(state.error).toBe("Final decode failure");
  expect(state.source).toBeNull();
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(2);
});
it("does not bypass a failed decision by opening the file", async () => {
  (prepareMediaPlayback as Mock).mockRejectedValue(new Error("A Plex Pass is required."));
  await render();
  expect(state.error).toBe("A Plex Pass is required.");
  expect(state.source).toBeNull();
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(1);
});
it("offers user-controlled Original after conversion refusal without another Plex request", async () => {
  quality = { bitrate: 12000 };
  (planMediaPlayback as Mock).mockResolvedValueOnce(converted).mockResolvedValueOnce(stream);
  (prepareMediaPlayback as Mock).mockRejectedValue(new PlexPlaybackRefusal("Server busy", true));
  await render();
  expect(state.error).toBe("Server busy");
  expect(state.source).toBeNull();
  expect(state.canTryOriginal).toBe(true);
  expect(planMediaPlayback).toHaveBeenLastCalledWith(expect.anything(), {});
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(1);
  quality = { bitrate: -1 };
  (prepareMediaPlayback as Mock).mockImplementation(async () => prepared(stream));
  await render();
  expect(state.error).toBeNull();
  expect(state.canTryOriginal).toBe(false);
  expect(state.source).not.toBeNull();
});
it.each([
  { reason: "unsupported codec", original: converted },
  { reason: "burn-in subtitles", original: { ...converted, subtitles: "burn" } },
])(
  "does not offer Original when video needs conversion because of $reason",
  async ({ original }) => {
    quality = { bitrate: 12000 };
    (planMediaPlayback as Mock).mockResolvedValueOnce(converted).mockResolvedValueOnce(original);
    (prepareMediaPlayback as Mock).mockRejectedValue(new PlexPlaybackRefusal("Server busy", true));
    await render();
    expect(state.canTryOriginal).toBe(false);
    expect(state.error).toBe("Server busy");
  },
);
it.each([
  { quality: {}, failure: new PlexPlaybackRefusal("Busy", true) },
  { quality: { bitrate: -1 }, failure: new PlexPlaybackRefusal("Busy", true) },
  { quality: { bitrate: 12000 }, failure: new PlexPlaybackRefusal("Denied", false) },
  { quality: { bitrate: 12000 }, failure: new PlexRequestError(403, "Forbidden") },
  { quality: { bitrate: 12000 }, failure: new Error("Unknown failure") },
])("does not offer Original for an unchanged quality or unrelated refusal: %j", async (sample) => {
  quality = sample.quality;
  (prepareMediaPlayback as Mock).mockRejectedValue(sample.failure);
  await render();
  expect(state.canTryOriginal).toBe(false);
  expect(planMediaPlayback).toHaveBeenCalledTimes(1);
});
it("preserves the Plex reason if probing Original fails", async () => {
  quality = { bitrate: 12000 };
  (planMediaPlayback as Mock).mockResolvedValueOnce(converted).mockRejectedValueOnce(new Error("Probe failed"));
  (prepareMediaPlayback as Mock).mockRejectedValue(new PlexPlaybackRefusal("Server busy", true));
  await render();
  expect(state.canTryOriginal).toBe(false);
  expect(state.error).toBe("Server busy");
});
it.each(["item", "profile"])("discards a late Original suggestion after a %s change", async (change) => {
  let complete!: (plan: PlexPlaybackPlan) => void;
  quality = { bitrate: 12000 };
  (planMediaPlayback as Mock).mockResolvedValueOnce(converted).mockReturnValueOnce(
    new Promise((resolve) => { complete = resolve; }),
  );
  (prepareMediaPlayback as Mock).mockRejectedValueOnce(new PlexPlaybackRefusal("Server busy", true));
  await render();
  if (change === "item") metadata = movie("2");
  else {
    session.scope = { serverId: "server", profileKey: "child" };
    session.revision++;
  }
  await render();
  const active = state.source;
  await act(async () => complete(stream));
  expect(state.source).toBe(active);
  expect(state.canTryOriginal).toBe(false);
  expect(state.error).toBeNull();
});
it("does not renegotiate an already compatible configuration", async () => {
  (planMediaPlayback as Mock).mockResolvedValue(converted);
  await render();
  await fail();
  expect(state.error).toBe("Decode failed");
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(1);
});
it("rejects a fallback that Plex resolves to the previous configuration", async () => {
  (planMediaPlayback as Mock)
    .mockResolvedValueOnce(stream)
    .mockResolvedValueOnce(converted);
  (prepareMediaPlayback as Mock).mockImplementation(async () => prepared(stream));
  await render();
  await fail();
  expect(state.error).toBe("Decode failed");
  expect(state.source).toBeNull();
  expect(releaseMediaPlayback).toHaveBeenCalledWith(expect.objectContaining({ id: "source-2" }));
});
it.each([401, 403, 404, 410, 429, 500, undefined])(
  "keeps network failure %s out of conversion",
  async (httpStatus) => {
    await render();
    const first = state.source;
    await fail({ kind: "network", httpStatus, message: "Connection failed" });
    expect(state.error).toBe("Connection failed");
    expect(prepareMediaPlayback).toHaveBeenCalledTimes(1);
    expect(releaseMediaPlayback).toHaveBeenCalledWith(first);
  },
);
it("reports subtitle failure as a warning while keeping the ready source", async () => {
  await render();
  const first = state.source!;
  await act(async () => {
    state.reportReady(first.id);
    state.reportSubtitleError({
      sourceId: first.id,
      kind: "subtitle",
      httpStatus: 403,
      message: "Subtitles unavailable",
    });
  });
  expect(state.source).toBe(first);
  expect(state.error).toBeNull();
  expect(state.loading).toBe(false);
  expect(state.subtitleError).toBe("Subtitles unavailable");
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(1);
  metadata = movie("2");
  await render();
  expect(state.subtitleError).toBeNull();
  expect(
    state.reportSubtitleError({
      sourceId: first.id,
      kind: "subtitle",
      message: "Stale",
    }),
  ).toBe(false);
});
it("handles duplicate decoder failures as a single fallback", async () => {
  await render();
  const sourceId = state.source!.id;
  await act(async () => {
    state.reportError({ sourceId, kind: "media", message: "Decode failed" });
    state.reportError({ sourceId, kind: "media", message: "Duplicate" });
  });
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(2);
});
it("ignores old source events after item changes", async () => {
  await render();
  const old = state.source!;
  metadata = movie("2");
  await render();
  const active = state.source;
  expect(
    state.reportError({
      sourceId: old.id,
      kind: "media",
      message: "Old error",
    }),
  ).toBe(false);
  expect(state.reportReady(old.id)).toBe(false);
  expect(state.source).toBe(active);
  expect(releaseMediaPlayback).toHaveBeenCalledWith(old);
});
it("rejects events if authentication changes before React renders", async () => {
  await render();
  const sourceId = state.source!.id;
  session.revision++;
  expect(state.reportError({ sourceId, kind: "media", message: "Old error" })).toBe(false);
  expect(state.reportReady(sourceId)).toBe(false);
});
it("discards a late capability probe after selecting a different item", async () => {
  let complete!: (plan: PlexPlaybackPlan) => void;
  (planMediaPlayback as Mock).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  await render();
  metadata = movie("2");
  await render();
  const active = state.source;
  await act(async () => complete(stream));
  expect(state.source).toBe(active);
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(1);
});
it("aborts profile preparation and releases a late source with its owning credentials", async () => {
  let complete!: (result: ReturnType<typeof prepared>) => void;
  (prepareMediaPlayback as Mock).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  await render();
  const call = (prepareMediaPlayback as Mock).mock.calls[0];
  expect(call[4]).toEqual({ "X-Plex-Token": "owner" });
  session.scope = { serverId: "server", profileKey: "child" };
  session.token = "child";
  session.revision++;
  await render();
  expect(call[5].aborted).toBe(true);
  const active = state.source;
  const late = prepared(stream);
  await act(async () => complete(late));
  expect(state.source).toBe(active);
  expect(state.error).toBeNull();
  expect(state.source?.requestContext).toEqual({ "X-Plex-Token": "child" });
  expect(releaseMediaPlayback).toHaveBeenCalledWith(late.source);
});
it("cancels preparation on unmount and releases an ignored-abort response", async () => {
  let complete!: (result: ReturnType<typeof prepared>) => void;
  (prepareMediaPlayback as Mock).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  await render();
  const signal = (prepareMediaPlayback as Mock).mock.calls[0][5];
  await act(async () => root.unmount());
  expect(signal.aborted).toBe(true);
  const late = prepared(stream);
  await act(async () => complete(late));
  expect(releaseMediaPlayback).toHaveBeenCalledWith(late.source);
});
it("releases the previous stream before reserving fallback capacity", async () => {
  (planMediaPlayback as Mock)
    .mockResolvedValueOnce(stream)
    .mockResolvedValueOnce(converted);
  await render();
  let complete!: () => void;
  (releaseMediaPlayback as Mock).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      complete = resolve;
    }),
  );
  await fail();
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(1);
  await act(async () => complete());
  expect(prepareMediaPlayback).toHaveBeenCalledTimes(2);
});
it("renegotiates quality changes and explicit reload after terminal failure", async () => {
  await render();
  quality = { bitrate: 2000 };
  await render();
  expect(planMediaPlayback).toHaveBeenLastCalledWith(
    expect.anything(),
    { bitrate: 2000 },
    "initial",
  );
  await fail({ kind: "network", message: "Offline" });
  expect(state.error).toBe("Offline");
  await act(async () => state.reload());
  expect(state.error).toBeNull();
  expect(state.source).not.toBeNull();
});
it("cleans only its source on unload and detaches the pagehide listener", async () => {
  await render();
  const source = state.source;
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(releaseMediaPlayback).toHaveBeenCalledWith(source, true);
  await act(async () => root.unmount());
  (releaseMediaPlayback as Mock).mockClear();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(releaseMediaPlayback).not.toHaveBeenCalled();
});
