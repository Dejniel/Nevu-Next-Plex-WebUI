import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Mock } from "vitest";
import { getMediaVersions, type MediaMetadata } from "entities/media/model";
import { searchSubtitles } from "../api/subtitles";
import type { SubtitleSearchResult } from "../model/subtitles";
import SubtitleSearchPanel from "./SubtitleSearchPanel";

vi.mock("../api/subtitles", () => ({ searchSubtitles: vi.fn() }));

const metadata: MediaMetadata = {
  ratingKey: "42",
  type: "movie",
  title: "Movie",
  Media: [
    {
      id: 44,
      Part: [{ id: 55, key: "/library/parts/55/file.mkv", file: "Movie.mkv" }],
    },
  ],
};
const result: SubtitleSearchResult = {
  key: "/library/streams/77",
  streamType: 3,
  title: "Movie.Release.en",
  languageCode: "eng",
  codec: "srt",
  providerTitle: "OpenSubtitles",
};

let host: HTMLDivElement;
let root: Root;
let onDownload: Mock<(subtitle: SubtitleSearchResult) => Promise<void>>;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("subtitleSearchLanguage", "en");
  vi.resetAllMocks();
  vi.mocked(searchSubtitles).mockResolvedValue([result]);
  onDownload = vi
    .fn<(subtitle: SubtitleSearchResult) => Promise<void>>()
    .mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const row = (title: string) =>
  Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(title),
  );
const render = () =>
  act(async () =>
    root.render(
      <SubtitleSearchPanel
        metadata={metadata}
        version={getMediaVersions(metadata)[0]}
        onDownload={onDownload}
      />,
    ),
  );
const submit = () =>
  act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );

it("prevents downloading results for changed criteria and while their replacement is loading", async () => {
  await render();
  const oldRow = row(result.title)!;
  expect(oldRow.disabled).toBe(false);
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Other Movie");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(oldRow.disabled).toBe(true);

  let finish!: (results: SubtitleSearchResult[]) => void;
  vi.mocked(searchSubtitles).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await submit();
  expect(vi.mocked(searchSubtitles).mock.calls[0][2]?.aborted).toBe(true);
  expect(row(result.title)).toBeUndefined();
  await act(async () => oldRow.click());
  expect(onDownload).not.toHaveBeenCalled();

  const replacement = {
    ...result,
    key: "/library/streams/88",
    title: "Other.Movie.Release.pl",
    languageCode: "pol",
  };
  await act(async () => finish([replacement]));
  expect(row(replacement.title)?.disabled).toBe(false);
  await act(async () => row(replacement.title)!.click());
  expect(onDownload).toHaveBeenCalledExactlyOnceWith(replacement);
});

it("retains the chosen result during download and permits retry after failure", async () => {
  let fail!: (reason: Error) => void;
  onDownload.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  await render();
  await act(async () => row(result.title)!.click());
  expect(row(result.title)?.disabled).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>('[aria-label="Search subtitles"]')
      ?.disabled,
  ).toBe(true);
  expect(
    host.querySelector<HTMLInputElement>('input[type="text"]')?.disabled,
  ).toBe(true);
  await submit();
  expect(searchSubtitles).toHaveBeenCalledTimes(1);

  await act(async () =>
    fail(new Error("Plex could not download this subtitle.")),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Plex could not download",
  );
  expect(row(result.title)?.disabled).toBe(false);
  expect(
    host.querySelector<HTMLInputElement>('input[type="text"]')?.disabled,
  ).toBe(false);
  await act(async () => row(result.title)!.click());
  expect(onDownload).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(row(result.title)?.disabled).toBe(true);
});
