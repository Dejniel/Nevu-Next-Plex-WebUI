import { canDecodeVideo } from "./capabilities";

const video = {
  contentType: 'video/mp4; codecs="hvc1.2.4.L153.B0"',
  width: 3840,
  height: 2160,
  bitrate: 20000000,
  framerate: 24,
};

it("checks the actual dimensions, bitrate and codec with MediaCapabilities", async () => {
  const decodingInfo = jest.fn().mockResolvedValue({ supported: true });
  expect(
    await canDecodeVideo(
      {
        canPlayType: () => true,
        mediaSourceSupported: () => true,
        decodingInfo,
      },
      "media-source",
      video,
    ),
  ).toBe(true);
  expect(decodingInfo).toHaveBeenCalledWith({
    type: "media-source",
    video,
    audio: undefined,
  });
});

it("does not advertise an unsupported MSE codec", async () => {
  const decodingInfo = jest.fn();
  expect(
    await canDecodeVideo(
      {
        canPlayType: () => true,
        mediaSourceSupported: () => false,
        decodingInfo,
      },
      "media-source",
      video,
    ),
  ).toBe(false);
  expect(decodingInfo).not.toHaveBeenCalled();
});

it("falls back to the codec probe if this MediaCapabilities query is not implemented", async () => {
  expect(
    await canDecodeVideo(
      {
        canPlayType: () => true,
        mediaSourceSupported: () => true,
        decodingInfo: async () => {
          throw new TypeError();
        },
      },
      "file",
      video,
    ),
  ).toBe(true);
});
