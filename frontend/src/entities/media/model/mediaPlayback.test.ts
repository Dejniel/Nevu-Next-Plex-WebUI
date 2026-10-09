import type { MediaRendition, MediaPart, MediaStream } from "plex/media";
import {
  planMediaPlayback,
  playbackDecisionPlan,
  playbackProfile,
} from "./mediaPlayback";
import { PlexPlaybackRefusal } from "shared/api/plexPlayback";
import type { MediaVersion } from "./mediaVersions";
import type { VideoCapabilityProbe } from "shared/lib/video/capabilities";

function version(container = "mp4", videoCodec = "h264", audioCodec = "aac"): MediaVersion {
  return {
    mediaIndex: 2,
    partIndex: 1,
    media: {
      container,
      videoCodec,
      audioCodec,
      width: 1920,
      height: 1080,
      bitrate: 10000,
    } as MediaRendition,
    part: {
      id: 20,
      key: "/library/parts/20/file",
      container,
      Stream: [
        {
          id: 1,
          streamType: 1,
          codec: videoCodec,
          profile: "high",
          level: 41,
          bitDepth: 8,
        },
        {
          id: 2,
          streamType: 2,
          codec: audioCodec,
          selected: true,
          channels: 2,
        },
      ],
    } as MediaPart & { key: string },
  };
}
const probe: VideoCapabilityProbe = {
  canPlayType: (type) => !type.includes("matroska") && !type.includes("ac-3"),
  mediaSourceSupported: (type) => !type.includes("ac-3"),
};
const plan = (sample = version(), quality = {}, intent: "initial" | "compatible" = "initial") =>
  planMediaPlayback(sample, quality, intent, probe);

it.each(["mp4", "mkv", "webm", "mpegts"])(
  "segments %s with copied video/audio even when native playback is available",
  async (container) => {
    const result = await planMediaPlayback(version(container), {}, "initial", {
      ...probe,
      canPlayType: () => true,
    });
    expect(result).toMatchObject({ protocol: "dash", copyVideo: true, copyAudio: true });
    expect(playbackProfile(result)).not.toContain("add-direct-play-profile");
  },
);
it("remuxes compatible streams from an unsupported container", async () => {
  expect(await plan(version("unknown"))).toMatchObject({
    copyVideo: true,
    copyAudio: true,
  });
});
it.each(["truehd", "dca", "ac3"])(
  "converts unsupported %s audio while copying the picture",
  async (codec) => {
    expect(await plan(version("mkv", "h264", codec))).toMatchObject({
      copyVideo: true,
      copyAudio: false,
      audioCodec: "aac",
    });
  },
);
it("copies supported VP9 while converting the audio", async () => {
  expect(await plan(version("mkv", "vp9", "truehd"))).toMatchObject({
    copyVideo: true,
    videoCodec: "vp9",
    copyAudio: false,
    protocol: "dash",
  });
});
it("declares fixed DASH segmentation for copied streams without altering native HLS", async () => {
  const dash = playbackProfile(await plan(version("mkv", "h264", "dca")));
  expect(dash).toContain("add-transcode-target-settings(type=videoProfile&context=streaming&protocol=dash&BreakNonKeyframes=true)");
  const hls = playbackProfile(await planMediaPlayback(version(), {}, "initial", {
    ...probe, mediaSourceSupported: () => false,
  }));
  expect(hls).toContain("protocol=hls");
  expect(hls).not.toContain("BreakNonKeyframes");
});
it.each([0, 6499, 12000, 40000])(
  "converts HEVC for an explicit quality even with source bitrate %i",
  async (bitrate) => {
    const sample = version("mkv", "hevc");
    sample.media.bitrate = bitrate;
    expect(await plan(sample, { bitrate: 12000 })).toMatchObject({
      videoCodec: "h264", copyVideo: false, copyAudio: true,
    });
  },
);
it("copies supported video at Original quality without a bitrate comparison", async () => {
  expect(await plan(version(), { bitrate: -1 })).toMatchObject({
    protocol: "dash", copyVideo: true, copyAudio: true,
  });
  expect(await plan(version("mkv", "hevc"))).toMatchObject({
    videoCodec: "hevc", copyVideo: true,
  });
});
it("preserves the selected alternate audio in a copied stream", async () => {
  const sample = version();
  sample.part.Stream![1].selected = false;
  sample.part.Stream!.push({
    id: 3,
    streamType: 2,
    codec: "aac",
    selected: true,
  } as MediaStream);
  expect(await plan(sample)).toMatchObject({ copyVideo: true, copyAudio: true });
});
it.each(["pgs", "ass"])("requires video conversion for %s burn-in subtitles", async (codec) => {
  const sample = version();
  sample.part.Stream!.push({
    id: 3,
    streamType: 3,
    codec,
    selected: true,
  } as MediaStream);
  expect(await plan(sample)).toMatchObject({
    subtitles: "burn", copyVideo: false,
  });
});
it("retains sidecar subtitles in both negotiated and compatible playback", async () => {
  const sample = version();
  const subtitle = {
    id: 3,
    streamType: 3,
    codec: "srt",
    selected: true,
  } as MediaStream;
  sample.part.Stream!.push(subtitle);
  expect(await plan(sample)).toMatchObject({
    subtitles: "sidecar", subtitle,
  });
  expect(await plan(sample, {}, "compatible")).toMatchObject({
    subtitles: "sidecar",
    subtitle,
    copyVideo: false,
    copyAudio: false,
  });
});
it("probes the actual HEVC profile rather than assuming codec support", async () => {
  const sample = version("mkv", "hevc");
  Object.assign(sample.part.Stream![0], {
    profile: "main 10",
    bitDepth: 10,
    level: 153,
  });
  const decodingInfo = vi.fn().mockResolvedValue({ supported: true });
  expect(
    await planMediaPlayback(sample, {}, "initial", { ...probe, decodingInfo }),
  ).toMatchObject({ copyVideo: true, videoCodec: "hevc" });
  expect(decodingInfo.mock.calls[0][0].video.contentType).toContain("hvc1.2.4.L153");
});
it("uses H264 if MediaCapabilities rejects the source", async () => {
  expect(
    await planMediaPlayback(version("mp4", "hevc"), {}, "initial", {
      ...probe,
      decodingInfo: async () => ({
        supported: false,
        smooth: false,
        powerEfficient: false,
      }),
    }),
  ).toMatchObject({
    copyVideo: false, videoCodec: "h264",
  });
});
it("selects native HLS when MSE is unavailable", async () => {
  expect(
    await planMediaPlayback(version(), {}, "initial", {
      ...probe,
      mediaSourceSupported: () => false,
    }),
  ).toMatchObject({ protocol: "hls" });
});
it("requires segmented playback even when only native MP4 files are supported", async () => {
  const nativeOnly = {
    canPlayType: (type: string) => type.includes("mp4"),
    mediaSourceSupported: () => false,
  };
  await expect(planMediaPlayback(version(), {}, "initial", nativeOnly)).rejects.toThrow(
    "does not support Plex streaming playback",
  );
});
it("offers one H264/AAC conversion without stream copying", async () => {
  expect(await plan(version("mkv", "hevc", "eac3"), {}, "compatible")).toMatchObject({
    videoCodec: "h264",
    audioCodec: "aac",
    copyVideo: false,
    copyAudio: false,
  });
});
it.each([
  { generalDecisionCode: 1000 },
  { generalDecisionCode: 1001, Metadata: [{ Media: [{ Part: [{ decision: "directplay" }] }] }] },
])("rejects unexpected Direct Play instead of opening the original", async (MediaContainer) => {
  const requestedPlan = await plan();
  expect(() => playbackDecisionPlan({ MediaContainer }, requestedPlan)).toThrow(
    "did not prepare the requested segmented stream",
  );
});
it("does not treat a Direct Play refusal as refusal of allowed conversion", async () => {
  const request = await plan();
  expect(
    playbackDecisionPlan(
      {
        MediaContainer: {
          generalDecisionCode: 1001,
          directPlayDecisionCode: 3000,
          Metadata: [{ Media: [{ Part: [{ Stream: [
            { streamType: 1, codec: "h264", decision: "copy" },
          ] }] }] }],
        },
      },
      request,
    ),
  ).toEqual(request);
});
it("reads selected media and parts and preserves Plex audio conversion", async () => {
  const request = await plan();
  expect(
    playbackDecisionPlan(
      {
        MediaContainer: {
          generalDecisionCode: 1001,
          Metadata: [
            {
              Media: [
                { Part: [{ decision: "directplay" }] },
                {
                  selected: true,
                  protocol: request.protocol,
                  Part: [
                    {
                      selected: true,
                      Stream: [
                        { streamType: 1, decision: "copy", codec: "h264" },
                        { streamType: 2, decision: "transcode", codec: "aac" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      request,
    ),
  ).toMatchObject({ copyVideo: true, copyAudio: false });
});
it("rejects a streaming codec that was never offered", async () => {
  const request = await plan(version("mkv"));
  expect(() =>
    playbackDecisionPlan(
      {
        MediaContainer: {
          generalDecisionCode: 1001,
          Metadata: [
            {
              Media: [{ Part: [{ Stream: [
                { streamType: 1, codec: "h264", decision: "copy" },
                { streamType: 2, codec: "dca" },
              ] }] }],
            },
          ],
        },
      },
      request,
    ),
  ).toThrow("unsupported streaming");
});
it("retains the server reason when no playback is allowed", async () => {
  const request = await plan();
  expect(() =>
    playbackDecisionPlan(
      {
        MediaContainer: {
          generalDecisionCode: 2000,
          generalDecisionText: "Playback unavailable.",
          transcodeDecisionCode: 4000,
          transcodeDecisionText: "Conversion is disabled.",
        },
      },
      request,
    ),
  ).toThrow("Playback unavailable. Conversion is disabled.");
  expect(() => playbackDecisionPlan({ MediaContainer: {} }, request)).toThrow("did not return");
});

it.each([
  { code: undefined, denied: false },
  { code: 1001, denied: false },
  { code: 2000, denied: true },
  { code: 4000, denied: true },
])(
  "classifies conversion refusal from decision code $code without matching the message",
  async ({ code: transcodeDecisionCode, denied }) => {
    const request = await plan();
    let refusal: unknown;
    try {
      playbackDecisionPlan({ MediaContainer: {
        generalDecisionCode: 2000,
        generalDecisionText: "Serwer nie może rozpocząć odtwarzania.",
        transcodeDecisionCode,
      } }, request);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(PlexPlaybackRefusal);
    expect(refusal).toMatchObject({ conversionDenied: denied });
  },
);

it("interprets the selected audio and burn-in without extracting a duplicate subtitle", async () => {
  const request = await plan();
  expect(
    playbackDecisionPlan(
      {
        MediaContainer: {
          generalDecisionCode: 1001,
          Metadata: [
            {
              Media: [
                {
                  Part: [
                    {
                      Stream: [
                        { streamType: 1, codec: "h264", decision: "copy" },
                        { streamType: 2, codec: "dca", selected: false },
                        { streamType: 2, codec: "aac", decision: "transcode", selected: true },
                        { streamType: 3, decision: "burn", selected: true },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      request,
    ),
  ).toMatchObject({ copyAudio: false, subtitles: "burn" });
});

it.each([
  { name: "missing video", video: [] },
  { name: "ignored video", video: [{ streamType: 1, codec: "hevc", decision: "ignore" }] },
  { name: "missing video decision", video: [{ streamType: 1, codec: "hevc" }] },
])("rejects a successful decision with $name", async ({ video }) => {
  const request = await plan(version("mkv", "hevc"));
  expect(() => playbackDecisionPlan({
    MediaContainer: {
      generalDecisionCode: 1001,
      transcodeDecisionCode: 1001,
      generalDecisionText: "Direct play not available; Conversion OK.",
      Metadata: [{ Media: [{ selected: true, protocol: "dash", Part: [{
        selected: true,
        decision: "transcode",
        Stream: [...video, { streamType: 2, codec: "aac", decision: "copy", selected: true }],
      }] }] }],
    },
  }, request)).toThrow("did not prepare a video track");
});
