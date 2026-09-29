import { getStreamProps } from "./playback";

it("passes the selected Plex media and part indexes to the transcoder", () => {
  const props = getStreamProps("123", {
    maxVideoBitrate: 8000,
    mediaIndex: 2,
    partIndex: 1,
  });

  expect(props).toMatchObject({
    path: "/library/metadata/123",
    mediaIndex: 2,
    partIndex: 1,
  });
});
