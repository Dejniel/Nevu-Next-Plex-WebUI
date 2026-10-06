import { planMediaPlayback, playbackDecisionPlan, playbackProfile } from "./mediaPlayback";
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
    } as Plex.Media,
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
    } as Plex.Part,
  };
}
const probe: VideoCapabilityProbe = {
  canPlayType: (type) => !type.includes("matroska") && !type.includes("ac-3"),
  mediaSourceSupported: (type) => !type.includes("ac-3"),
};
const plan = (sample = version(), quality = {}, intent: "initial" | "compatible" = "initial") =>
  planMediaPlayback(sample, quality, intent, probe);

it("offers a supported original and a streaming target to Plex", async () => {
  expect(await plan()).toMatchObject({
    original: { container: "mp4", videoCodec: "h264", audioCodec: "aac" },
    stream: { protocol: "dash", copyVideo: true, copyAudio: true },
  });
});
it("requires support for the container, video and audio before offering Direct Play", async () => {
  for (const sample of [version("mkv"), version("mp4", "unknown"), version("mp4", "h264", "dca")])
    expect((await plan(sample)).original).toBeUndefined();
  expect((await plan(version("unknown"))).original).toBeUndefined();
});
it("remuxes compatible streams from an unsupported container", async () => {
  expect((await plan(version("mkv"))).stream).toMatchObject({
    copyVideo: true,
    copyAudio: true,
  });
});
it.each(["truehd", "dca", "ac3"])(
  "converts unsupported %s audio while copying the picture",
  async (codec) => {
    expect((await plan(version("mkv", "h264", codec))).stream).toMatchObject({
      copyVideo: true,
      copyAudio: false,
      audioCodec: "aac",
    });
  },
);
it("copies supported VP9 while converting the audio", async () => {
  expect((await plan(version("mkv", "vp9", "truehd"))).stream).toMatchObject({
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
it("honors a lower bitrate, including missing bitrate metadata", async () => {
  expect(await plan(version(), { bitrate: 8000 })).toMatchObject({
    original: undefined,
    stream: { copyVideo: false },
  });
  expect((await plan(version(), { bitrate: -1 })).original).toBeDefined();
  const sample = version();
  sample.media.bitrate = 0;
  expect((await plan(sample, { bitrate: 8000 })).original).toBeUndefined();
});
it("keeps the selected alternate audio out of Direct Play", async () => {
  const sample = version();
  sample.part.Stream[1].selected = false;
  sample.part.Stream.push({
    id: 3,
    streamType: 2,
    codec: "aac",
    selected: true,
  } as Plex.Stream);
  expect((await plan(sample)).original).toBeUndefined();
});
it.each(["pgs", "ass"])("requires video conversion for %s burn-in subtitles", async (codec) => {
  const sample = version();
  sample.part.Stream.push({
    id: 3,
    streamType: 3,
    codec,
    selected: true,
  } as Plex.Stream);
  expect(await plan(sample)).toMatchObject({
    original: undefined,
    stream: { subtitles: "burn", copyVideo: false },
  });
});
it("retains sidecar subtitles in both negotiated and compatible playback", async () => {
  const sample = version();
  const subtitle = {
    id: 3,
    streamType: 3,
    codec: "srt",
    selected: true,
  } as Plex.Stream;
  sample.part.Stream.push(subtitle);
  expect(await plan(sample)).toMatchObject({
    original: { subtitle },
    stream: { subtitles: "sidecar", subtitle },
  });
  expect(await plan(sample, {}, "compatible")).toMatchObject({
    original: undefined,
    stream: {
      subtitles: "sidecar",
      subtitle,
      copyVideo: false,
      copyAudio: false,
    },
  });
});
it("probes the actual HEVC profile rather than assuming codec support", async () => {
  const sample = version("mkv", "hevc");
  Object.assign(sample.part.Stream[0], {
    profile: "main 10",
    bitDepth: 10,
    level: 153,
  });
  const decodingInfo = vi.fn().mockResolvedValue({ supported: true });
  expect(
    (await planMediaPlayback(sample, {}, "initial", { ...probe, decodingInfo })).stream,
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
    original: undefined,
    stream: { copyVideo: false, videoCodec: "h264" },
  });
});
it("selects native HLS when MSE is unavailable", async () => {
  expect(
    (
      await planMediaPlayback(version(), {}, "initial", {
        ...probe,
        mediaSourceSupported: () => false,
      })
    ).stream,
  ).toMatchObject({ protocol: "hls" });
});
it("allows a verified native file without requiring a streaming API", async () => {
  const nativeOnly = {
    canPlayType: (type: string) => type.includes("mp4"),
    mediaSourceSupported: () => false,
  };
  expect(await planMediaPlayback(version(), {}, "initial", nativeOnly)).toMatchObject({
    original: { container: "mp4" },
    stream: null,
  });
  await expect(planMediaPlayback(version("mkv"), {}, "initial", nativeOnly)).rejects.toThrow(
    "does not support playback",
  );
});
it("offers one H264/AAC conversion without native or stream copying", async () => {
  expect(await plan(version("mkv", "hevc", "eac3"), {}, "compatible")).toMatchObject({
    original: undefined,
    stream: {
      videoCodec: "h264",
      audioCodec: "aac",
      copyVideo: false,
      copyAudio: false,
    },
  });
});
it("uses a successful overall Direct Play decision", async () => {
  expect(
    playbackDecisionPlan({ MediaContainer: { generalDecisionCode: 1000 } }, await plan()),
  ).toEqual({ kind: "original", subtitle: undefined });
});
it("does not treat a Direct Play refusal as refusal of allowed conversion", async () => {
  const request = await plan();
  expect(
    playbackDecisionPlan(
      {
        MediaContainer: {
          generalDecisionCode: 1001,
          directPlayDecisionCode: 3000,
        },
      },
      request,
    ),
  ).toEqual(request.stream);
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
                  protocol: request.stream!.protocol,
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
  ).toMatchObject({ kind: "plex", copyVideo: true, copyAudio: false });
});
it("rejects an original or streaming codec that was never offered", async () => {
  const request = await plan(version("mkv"));
  expect(() =>
    playbackDecisionPlan({ MediaContainer: { generalDecisionCode: 1000 } }, request),
  ).toThrow("unsupported original");
  expect(() =>
    playbackDecisionPlan(
      {
        MediaContainer: {
          generalDecisionCode: 1001,
          Metadata: [
            {
              Media: [{ Part: [{ Stream: [{ streamType: 2, codec: "dca" }] }] }],
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
