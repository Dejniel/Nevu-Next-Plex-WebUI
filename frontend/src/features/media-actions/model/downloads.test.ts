import type {
  MediaMetadata,
  MediaRendition,
  MediaPart,
} from "entities/media/model";
import { AuthStorage } from "features/session/model";
import { getOriginalDownloads, originalFilename } from "./downloads";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

function metadata(): MediaMetadata {
  return {
    title: "Film: Test",
    Media: [
      {
        id: 10,
        videoResolution: "1080",
        container: "mkv",
        Part: [
          {
            id: 20,
            key: "/library/parts/20/123456/file.mkv?existing=value",
            file: "D:\\Movies\\Film Test (2024).mkv",
            size: 1024,
            container: "mkv",
          } as MediaPart,
        ],
      } as MediaRendition,
    ],
  } as MediaMetadata;
}

it("builds an authenticated URL for the original file", () => {
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account-token",
    serverToken: "server token",
  });

  const [download] = getOriginalDownloads(metadata(), true);
  const url = new URL(download.href, "http://nevu.local");

  expect(url.pathname).toBe("/dynproxy/library/parts/20/123456/file.mkv");
  expect(url.searchParams.get("existing")).toBe("value");
  expect(url.searchParams.get("download")).toBe("1");
  expect(url.searchParams.get("X-Plex-Token")).toBe("server token");
  expect(download.filename).toBe("Film Test (2024).mkv");
});

it("does not expose a download without permission and a server token", () => {
  expect(getOriginalDownloads(metadata(), true)).toEqual([]);
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account-token",
    serverToken: "server-token",
  });
  expect(getOriginalDownloads(metadata(), false)).toEqual([]);
});

it("creates a safe fallback filename", () => {
  expect(
    originalFilename(metadata(), { container: "mkv" } as MediaPart),
  ).toBe("Film_ Test.mkv");
});
