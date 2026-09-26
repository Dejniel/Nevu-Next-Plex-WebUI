import { AuthStorage } from "../auth/AuthStorage";
import { getOriginalDownloads, originalFilename } from "./download";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

function metadata(): Plex.Metadata {
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
          } as Plex.Part,
        ],
      } as Plex.Media,
    ],
  } as Plex.Metadata;
}

it("builds an authenticated URL for the original file", () => {
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account-token",
    serverToken: "server token",
  });

  const [download] = getOriginalDownloads(metadata());
  const url = new URL(download.href, "http://nevu.local");

  expect(url.pathname).toBe(
    "/dynproxy/library/parts/20/123456/file.mkv",
  );
  expect(url.searchParams.get("existing")).toBe("value");
  expect(url.searchParams.get("download")).toBe("1");
  expect(url.searchParams.get("X-Plex-Token")).toBe("server token");
  expect(download.filename).toBe("Film Test (2024).mkv");
});

it("does not expose a download without an active server token", () => {
  expect(getOriginalDownloads(metadata())).toEqual([]);
});

it("creates a safe fallback filename", () => {
  const data = metadata();
  const part = { container: "mkv" } as Plex.Part;

  expect(originalFilename(data, part)).toBe("Film_ Test.mkv");
});
