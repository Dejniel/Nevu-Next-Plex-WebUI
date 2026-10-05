import {
  initialPlaybackPlan,
  planMediaPlayback,
  playbackDecisionPlan,
  playbackPlanKey,
} from "./mediaPlayback";
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
  canPlayType: (type) =>
    !type.includes("matroska") &&
    !type.includes("ac-3") &&
    !type.includes("dts") &&
    !type.includes("truehd"),
  mediaSourceSupported: (type) =>
    !type.includes("ac-3") && !type.includes("dts") && !type.includes("truehd"),
};

it("tries originals even when their codec or container is unknown", () => {
  expect(initialPlaybackPlan(version("mkv", "unknown", "dca"), {})).toMatchObject({
    kind: "original",
  });
});

it("honors a lower bitrate, including files without bitrate metadata", () => {
  expect(initialPlaybackPlan(version(), { bitrate: 8000 })).toBeNull();
  expect(initialPlaybackPlan(version(), { bitrate: -1 })).toMatchObject({ kind: "original" });
  const sample = version();
  sample.media.bitrate = 0;
  expect(initialPlaybackPlan(sample, { bitrate: 8000 })).toBeNull();
});

it("preserves the selected alternate audio instead of opening the first track", () => {
  const sample = version();
  sample.part.Stream[1].selected = false;
  sample.part.Stream.push({ id: 3, streamType: 2, codec: "aac", selected: true } as Plex.Stream);
  expect(initialPlaybackPlan(sample, {})).toBeNull();
});

it.each(["pgs", "ass"])("starts with Plex for %s burn-in subtitles", async (codec) => {
  const sample = version();
  sample.part.Stream.push({ id: 3, streamType: 3, codec, selected: true } as Plex.Stream);
  expect(initialPlaybackPlan(sample, {})).toBeNull();
  expect(await planMediaPlayback(sample, {}, "stream", probe)).toMatchObject({
    subtitles: "burn",
    copyVideo: false,
  });
});

it("keeps text subtitles alongside an original file", () => {
  const sample = version();
  const subtitle = { id: 3, streamType: 3, codec: "srt", selected: true } as Plex.Stream;
  sample.part.Stream.push(subtitle);
  expect(initialPlaybackPlan(sample, {})).toEqual({ kind: "original", subtitle });
});

it("remuxes compatible streams after the original fails", async () => {
  expect(await planMediaPlayback(version("mkv"), {}, "stream", probe)).toMatchObject({
    kind: "plex",
    copyVideo: true,
    copyAudio: true,
    protocol: "dash",
    subtitles: "none",
  });
});

it.each(["truehd", "dca", "ac3"])(
  "converts unsupported %s audio without converting the picture",
  async (codec) => {
    expect(
      await planMediaPlayback(version("mkv", "h264", codec), {}, "stream", probe),
    ).toMatchObject({
      copyVideo: true,
      copyAudio: false,
      audioCodec: "aac",
    });
  },
);

it("copies supported VP9 while converting the audio", async () => {
  expect(
    await planMediaPlayback(version("mkv", "vp9", "truehd"), {}, "stream", probe),
  ).toMatchObject({
    copyVideo: true,
    videoCodec: "vp9",
    copyAudio: false,
  });
});

it("probes the actual HEVC profile for copying in a Plex stream", async () => {
  const sample = version("mkv", "hevc");
  Object.assign(sample.part.Stream[0], { profile: "main 10", bitDepth: 10, level: 153 });
  const decodingInfo = vi.fn().mockResolvedValue({ supported: true });
  expect(await planMediaPlayback(sample, {}, "stream", { ...probe, decodingInfo })).toMatchObject({
    copyVideo: true,
    videoCodec: "hevc",
  });
  expect(decodingInfo.mock.calls[0][0].video.contentType).toContain("hvc1.2.4.L153");
});

it("uses H264 when MediaCapabilities rejects the source profile", async () => {
  expect(
    await planMediaPlayback(version("mp4", "hevc"), {}, "stream", {
      ...probe,
      decodingInfo: async () => ({ supported: false, smooth: false, powerEfficient: false }),
    }),
  ).toMatchObject({ copyVideo: false, videoCodec: "h264" });
});

it("selects HLS when MSE is unavailable", async () => {
  expect(
    await planMediaPlayback(version(), {}, "stream", {
      ...probe,
      mediaSourceSupported: () => false,
    }),
  ).toMatchObject({ protocol: "hls" });
});

it("can still try an original on a browser without streaming APIs", async () => {
  const nativeOnly = { canPlayType: () => false, mediaSourceSupported: () => false };
  expect(initialPlaybackPlan(version(), {})).toMatchObject({ kind: "original" });
  await expect(planMediaPlayback(version(), {}, "stream", nativeOnly)).rejects.toThrow(
    "streaming playback",
  );
});

it("converts the picture at a lower bitrate while retaining sidecar subtitles", async () => {
  const sample = version();
  sample.part.Stream.push({ id: 3, streamType: 3, codec: "srt", selected: true } as Plex.Stream);
  expect(await planMediaPlayback(sample, { bitrate: 8000 }, "stream", probe)).toMatchObject({
    subtitles: "sidecar",
    copyVideo: false,
  });
  expect(await planMediaPlayback(sample, {}, "burn-subtitles", probe)).toMatchObject({
    subtitles: "burn",
    copyVideo: false,
    copyAudio: true,
  });
});

it("offers one explicit H264/AAC conversion alternative", async () => {
  expect(
    await planMediaPlayback(version("mkv", "hevc", "eac3"), {}, "convert", probe),
  ).toMatchObject({
    videoCodec: "h264",
    audioCodec: "aac",
    copyVideo: false,
    copyAudio: false,
  });
});

it("accepts a failed Direct Play decision when the overall result allows conversion", async () => {
  const plan = await planMediaPlayback(version(), {}, "stream", probe);
  expect(
    playbackDecisionPlan(
      { MediaContainer: { generalDecisionCode: 1001, directPlayDecisionCode: 3000 } },
      plan,
    ),
  ).toEqual(plan);
});

it("uses the actual codecs and copy decisions returned by Plex", async () => {
  const plan = await planMediaPlayback(version(), {}, "stream", probe);
  const result = playbackDecisionPlan(
    {
      MediaContainer: {
        generalDecisionCode: 1001,
        Metadata: [
          {
            Media: [
              { Part: [{ Stream: [{ streamType: 2, decision: "transcode", codec: "aac" }] }] },
            ],
          },
        ],
      },
    },
    plan,
  );
  expect(result).toMatchObject({ copyVideo: true, copyAudio: false, audioCodec: "aac" });
  expect(playbackPlanKey(result)).not.toBe(playbackPlanKey(plan));
});

it("retains the detailed reason when neither playback method is available", async () => {
  const plan = await planMediaPlayback(version(), {}, "stream", probe);
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
      plan,
    ),
  ).toThrow("Playback unavailable. Conversion is disabled.");
  expect(() => playbackDecisionPlan({ MediaContainer: {} }, plan)).toThrow("did not return");
});
