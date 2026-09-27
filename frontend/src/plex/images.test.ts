import {
  getResponsiveTranscodeImageProps,
  transcodeHeight,
} from "./images";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(
    "nevu.auth.activeSession",
    JSON.stringify({ accountToken: "account", serverToken: "server", profile: null }),
  );
});

it("keeps image variants on the requested aspect ratio", () => {
  expect(transcodeHeight(640, 16 / 9)).toBe(360);
  expect(transcodeHeight(480, 2 / 3)).toBe(720);
});

it("builds sorted, deduplicated responsive Plex image candidates", () => {
  const props = getResponsiveTranscodeImageProps("/library/art", {
    widths: [640, 320, 640, 480],
    aspectRatio: 16 / 9,
    sizes: "320px",
    fallbackWidth: 500,
  });

  expect(props.src).toContain("width=640");
  expect(props.src).toContain("height=360");
  expect(props.srcSet.match(/ 320w| 480w| 640w/g)).toEqual([
    " 320w",
    " 480w",
    " 640w",
  ]);
  expect(props.sizes).toBe("320px");
});
