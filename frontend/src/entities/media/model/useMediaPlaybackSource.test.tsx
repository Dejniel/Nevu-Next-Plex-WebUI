import type { Mock } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMediaPlaybackSource,
  getMediaPlaybackDecision,
  releaseMediaPlayback,
} from "../api/mediaPlayback";
import { planMediaPlayback } from "./mediaPlayback";
import type {
  PlexPlaybackPlan,
  PlexStreamPlan,
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
  createMediaPlaybackSource: vi.fn(),
  getMediaPlaybackDecision: vi.fn(),
  releaseMediaPlayback: vi.fn(),
}));
vi.mock("./mediaPlayback", async () => ({
  ...(await vi.importActual<typeof import("./mediaPlayback")>("./mediaPlayback")),
  planMediaPlayback: vi.fn(),
}));
const stream: PlexStreamPlan = {
  kind: "plex",
  protocol: "dash",
  copyVideo: true,
  copyAudio: true,
  videoCodec: "h264",
  audioCodec: "aac",
  subtitles: "none",
};
const converted: PlexStreamPlan = { ...stream, copyVideo: false, copyAudio: false };
function movie(id = "1"): Plex.Metadata {
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
  } as Plex.Metadata;
}
let root: Root;
let metadata: Plex.Metadata | null;
let quality: MediaPlaybackQuality;
let state: ReturnType<typeof useMediaPlaybackSource>;
let sequence: number;
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
  (planMediaPlayback as Mock).mockImplementation(async (_version, _quality, intent) =>
    intent === "convert" ? converted : stream,
  );
  (createMediaPlaybackSource as Mock).mockImplementation(
    (_metadata, _version, _quality, plan: PlexPlaybackPlan, requestContext) =>
      ({
        id: `source-${++sequence}`,
        type: plan.kind === "original" ? "file" : plan.protocol,
        url: "/media",
        requestContext,
        sessionID: plan.kind === "original" ? undefined : `session-${sequence}`,
      }) satisfies PlexPlaybackSource,
  );
  (getMediaPlaybackDecision as Mock).mockResolvedValue({
    MediaContainer: { generalDecisionCode: 1001 },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("tries an original before any capability probe or Plex decision", async () => {
  await render();
  expect(state.source?.type).toBe("file");
  expect(planMediaPlayback).not.toHaveBeenCalled();
  expect(getMediaPlaybackDecision).not.toHaveBeenCalled();
  expect(state.reportReady("stale")).toBe(false);
  await act(async () => {
    expect(state.reportReady(state.source!.id)).toBe(true);
  });
  expect(state.loading).toBe(false);
});

it("tries a Plex stream only after an actual original failure", async () => {
  await render();
  const original = state.source;
  await fail();
  expect(state.source?.type).toBe("dash");
  expect(planMediaPlayback).toHaveBeenCalledTimes(1);
  expect(getMediaPlaybackDecision).not.toHaveBeenCalled();
  expect(releaseMediaPlayback).toHaveBeenCalledWith(original);
});

it("diagnoses after the stream fails and allows one different configuration", async () => {
  await render();
  await fail();
  await fail();
  expect(getMediaPlaybackDecision).toHaveBeenCalledTimes(1);
  expect((createMediaPlaybackSource as Mock).mock.lastCall?.[3]).toEqual(converted);
  await fail({ kind: "media", message: "Final decode failure" });
  expect(state.error).toBe("Final decode failure");
  expect(state.source).toBeNull();
  expect(createMediaPlaybackSource).toHaveBeenCalledTimes(3);
  expect(getMediaPlaybackDecision).toHaveBeenCalledTimes(1);
});

it("does not let a hypothetical Plex Pass refusal block the successful original", async () => {
  (getMediaPlaybackDecision as Mock).mockResolvedValue({
    MediaContainer: {
      generalDecisionCode: 2000,
      generalDecisionText: "A Plex Pass is required.",
    },
  });
  await render();
  expect(state.error).toBeNull();
  expect(getMediaPlaybackDecision).not.toHaveBeenCalled();
  await fail();
  await fail();
  expect(state.error).toBe("A Plex Pass is required.");
  expect(createMediaPlaybackSource).toHaveBeenCalledTimes(2);
});

it("never repeats an identical stream even if Plex says Conversion OK", async () => {
  (planMediaPlayback as Mock).mockResolvedValue(converted);
  await render();
  await fail();
  await fail();
  expect(state.error).toBe("Decode failed");
  expect(createMediaPlaybackSource).toHaveBeenCalledTimes(2);
});

it.each([401, 403, 404, 410, 429])(
  "stops HTTP %s without converting or diagnosing",
  async (httpStatus) => {
    await render();
    const original = state.source;
    await fail({ kind: "network", httpStatus, message: "Request rejected" });
    expect(state.error).toBe("Request rejected");
    expect(planMediaPlayback).not.toHaveBeenCalled();
    expect(getMediaPlaybackDecision).not.toHaveBeenCalled();
    expect(releaseMediaPlayback).toHaveBeenCalledWith(original);
  },
);

it("does not transcode because of a disconnected client", async () => {
  await render();
  await fail({ kind: "network", message: "Offline" });
  expect(state.error).toBe("Offline");
  expect(planMediaPlayback).not.toHaveBeenCalled();
});

it("diagnoses a server-side stream failure rather than reporting a decoder error", async () => {
  await render();
  await fail();
  await fail({ kind: "network", httpStatus: 500, message: "Server failed" });
  expect(getMediaPlaybackDecision).toHaveBeenCalledTimes(1);
  expect((createMediaPlaybackSource as Mock).mock.lastCall?.[3]).toEqual(converted);
});

it("advances once when duplicate failures arrive before React renders", async () => {
  await render();
  const sourceId = state.source!.id;
  await act(async () => {
    state.reportError({ sourceId, kind: "media", message: "Decode failed" });
    state.reportError({ sourceId, kind: "media", message: "Decode failed twice" });
  });
  expect(createMediaPlaybackSource).toHaveBeenCalledTimes(2);
  expect(getMediaPlaybackDecision).not.toHaveBeenCalled();
});

it("ignores old failure and readiness events after switching the item", async () => {
  await render();
  const old = state.source!;
  metadata = movie("2");
  await render();
  const current = state.source;
  expect(state.reportError({ sourceId: old.id, kind: "media", message: "Old error" })).toBe(false);
  expect(state.reportReady(old.id)).toBe(false);
  expect(state.source).toBe(current);
  expect(planMediaPlayback).not.toHaveBeenCalled();
  expect(releaseMediaPlayback).toHaveBeenCalledWith(old);
});

it("rejects source events when the session changes before the next React render", async () => {
  await render();
  const sourceId = state.source!.id;
  session.revision++;
  expect(state.reportError({ sourceId, kind: "media", message: "Old error" })).toBe(false);
  expect(state.reportReady(sourceId)).toBe(false);
  expect(planMediaPlayback).not.toHaveBeenCalled();
});

it("discards a late capability probe after a new item is selected", async () => {
  let complete!: (plan: PlexStreamPlan) => void;
  (planMediaPlayback as Mock).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  quality = { bitrate: 2000 };
  await render();
  metadata = movie("2");
  quality = {};
  await render();
  const current = state.source;
  await act(async () => complete(stream));
  expect(state.source).toBe(current);
  expect(createMediaPlaybackSource).toHaveBeenCalledTimes(1);
});

it("aborts a delayed diagnosis when the profile changes, retaining owning credentials", async () => {
  let complete!: (decision: unknown) => void;
  (getMediaPlaybackDecision as Mock).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  await render();
  await fail();
  await fail();
  const call = (getMediaPlaybackDecision as Mock).mock.calls[0];
  expect(call[4]).toEqual({ "X-Plex-Token": "owner" });
  session.scope = { serverId: "server", profileKey: "child" };
  session.token = "child";
  session.revision++;
  await render();
  expect(call[5].aborted).toBe(true);
  const current = state.source;
  await act(async () =>
    complete({ MediaContainer: { generalDecisionCode: 2000, generalDecisionText: "Old failure" } }),
  );
  expect(state.source).toBe(current);
  expect(state.error).toBeNull();
  expect(state.source?.requestContext).toEqual({ "X-Plex-Token": "child" });
});

it("cancels diagnosis on unmount without creating a late source", async () => {
  let complete!: (decision: unknown) => void;
  (getMediaPlaybackDecision as Mock).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  await render();
  await fail();
  await fail();
  const signal = (getMediaPlaybackDecision as Mock).mock.calls[0][5];
  await act(async () => root.unmount());
  expect(signal.aborted).toBe(true);
  await act(async () => complete({ MediaContainer: { generalDecisionCode: 1001 } }));
  expect(createMediaPlaybackSource).toHaveBeenCalledTimes(2);
});

it("uses burn-in after a sidecar failure while preserving the selected subtitle", async () => {
  await render();
  await fail({ kind: "subtitle", message: "Subtitle failed" });
  expect(planMediaPlayback).toHaveBeenCalledWith(expect.anything(), {}, "burn-subtitles");
});

it("starts with Plex for a lower bitrate and restarts originals on explicit retry", async () => {
  quality = { bitrate: 2000 };
  await render();
  expect(state.source?.type).toBe("dash");
  expect(planMediaPlayback).toHaveBeenCalledWith(expect.anything(), { bitrate: 2000 }, "stream");
  expect(getMediaPlaybackDecision).not.toHaveBeenCalled();
  quality = {};
  await render();
  await fail({ kind: "network", message: "Offline" });
  expect(state.error).toBe("Offline");
  await act(async () => state.reload());
  expect(state.error).toBeNull();
  expect(state.source?.type).toBe("file");
});

it("stops its owned session on page unload and removes the listener on unmount", async () => {
  quality = { bitrate: 2000 };
  await render();
  const source = state.source;
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(releaseMediaPlayback).toHaveBeenCalledWith(source, true);
  await act(async () => root.unmount());
  (releaseMediaPlayback as Mock).mockClear();
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(releaseMediaPlayback).not.toHaveBeenCalled();
});
