import { planMediaPlayback, playbackDecisionMode } from "./mediaPlayback";
import type { MediaVersion } from "./mediaVersions";
import type { VideoCapabilityProbe } from "shared/lib/video/capabilities";

function version(
  container = "mp4",
  videoCodec = "h264",
  audioCodec = "aac",
): MediaVersion {
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

it("keeps Original compatible with remuxing instead of forcing a raw MKV", async () => {
  const plan = await planMediaPlayback(
    version("mkv"),
    { bitrate: -1 },
    false,
    probe,
  );
  expect(plan).toMatchObject({
    directPlay: false,
    copyVideo: true,
    copyAudio: true,
    protocol: "dash",
    subtitles: "none",
  });
});

it("direct plays a supported file with the default audio track", async () => {
  expect(await planMediaPlayback(version(), {}, false, probe)).toMatchObject({
    directPlay: true,
    copyVideo: true,
    copyAudio: true,
  });
});

it("copies the picture when only audio is unsupported", async () => {
  expect(
    await planMediaPlayback(version("mkv", "h264", "truehd"), {}, false, probe),
  ).toMatchObject({ copyVideo: true, copyAudio: false, audioCodec: "aac" });
});

it("does not direct play an MP4 with an unknown audio codec", async () => {
  expect(
    await planMediaPlayback(version("mp4", "h264", "dca"), {}, false, probe),
  ).toMatchObject({ directPlay: false, copyVideo: true, copyAudio: false });
});

it("keeps VP9 in MP4 while converting unsupported audio", async () => {
  expect(
    await planMediaPlayback(version("mkv", "vp9", "truehd"), {}, false, probe),
  ).toMatchObject({ copyVideo: true, copyAudio: false, audioCodec: "aac" });
});

it("keeps HEVC when this device can decode its profile", async () => {
  const sample = version("mkv", "hevc");
  sample.part.Stream[0] = {
    ...sample.part.Stream[0],
    profile: "main 10",
    bitDepth: 10,
    level: 153,
  };
  const decodingInfo = jest.fn().mockResolvedValue({ supported: true });
  const plan = await planMediaPlayback(sample, {}, false, {
    ...probe,
    decodingInfo,
  });
  expect(plan.copyVideo).toBe(true);
  expect(plan.videoCodec).toBe("hevc");
  expect(decodingInfo.mock.calls[0][0].video.contentType).toContain(
    "hvc1.2.4.L153",
  );
});

it("respects a negative MediaCapabilities result", async () => {
  const plan = await planMediaPlayback(version("mp4", "hevc"), {}, false, {
    ...probe,
    decodingInfo: async () => ({
      supported: false,
      smooth: false,
      powerEfficient: false,
    }),
  });
  expect(plan).toMatchObject({
    copyVideo: false,
    videoCodec: "h264",
    directPlay: false,
  });
});

it("selects native HLS when MSE is unavailable", async () => {
  const plan = await planMediaPlayback(version(), {}, false, {
    ...probe,
    mediaSourceSupported: () => false,
  });
  expect(plan.protocol).toBe("hls");
});

it("can direct play native HEVC while using H264 for an HLS fallback", async () => {
  const plan = await planMediaPlayback(version("mp4", "hevc"), {}, false, {
    ...probe,
    mediaSourceSupported: () => false,
  });
  expect(plan).toMatchObject({
    protocol: "hls",
    directPlay: true,
    copyVideo: false,
    videoCodec: "h264",
  });
});

it("remuxes the selected alternate audio track instead of playing the first track", async () => {
  const sample = version();
  sample.part.Stream.push({
    id: 3,
    streamType: 2,
    codec: "aac",
    selected: true,
  } as Plex.Stream);
  sample.part.Stream[1].selected = false;
  expect((await planMediaPlayback(sample, {}, false, probe)).directPlay).toBe(
    false,
  );
});

it("renders text subtitles independently of the selected bitrate", async () => {
  const sample = version();
  sample.part.Stream.push({
    id: 3,
    streamType: 3,
    codec: "srt",
    selected: true,
  } as Plex.Stream);
  const plan = await planMediaPlayback(sample, { bitrate: 8000 }, false, probe);
  expect(plan).toMatchObject({ subtitles: "sidecar", copyVideo: false });
});

it("uses Plex burn-in for image subtitles", async () => {
  const sample = version();
  sample.part.Stream.push({
    id: 3,
    streamType: 3,
    codec: "pgs",
    selected: true,
  } as Plex.Stream);
  expect(await planMediaPlayback(sample, {}, false, probe)).toMatchObject({
    subtitles: "burn",
    copyVideo: false,
    directPlay: false,
  });
});

it("requests a compatible H264/AAC source after a decoder failure", async () => {
  expect(
    await planMediaPlayback(version("mp4", "hevc", "eac3"), {}, true, probe),
  ).toMatchObject({
    videoCodec: "h264",
    audioCodec: "aac",
    copyVideo: false,
    copyAudio: false,
    directPlay: false,
  });
});

it("uses Plex's actual stream decisions to report the playback mode", async () => {
  const plan = await planMediaPlayback(version("mkv"), {}, false, probe);
  expect(
    playbackDecisionMode(
      {
        MediaContainer: {
          generalDecisionCode: 1001,
          Metadata: [
            {
              Media: [
                {
                  Part: [
                    { Stream: [{ streamType: 2, decision: "transcode" }] },
                  ],
                },
              ],
            },
          ],
        },
      },
      plan,
    ),
  ).toBe("audio-transcode");
});

it("fails with the Plex decision reason when conversion is unavailable", async () => {
  const plan = await planMediaPlayback(version("mkv"), {}, false, probe);
  expect(() =>
    playbackDecisionMode(
      {
        MediaContainer: {
          generalDecisionCode: 2000,
          generalDecisionText: "Conversion is disabled.",
        },
      },
      plan,
    ),
  ).toThrow("Conversion is disabled.");
});
