import {
  getMediaVersions,
  type MediaMetadata,
  type MediaStream,
} from "entities/media/model";
import {
  defaultSubtitleSearchTitle,
  findAttachedSubtitle,
  waitForAttachedSubtitle,
  type SubtitleSearchResult,
} from "./subtitles";
const result: SubtitleSearchResult = {
  id: 77,
  key: "/library/streams/77",
  sourceKey: "provider://release",
  streamType: 3,
  codec: "srt",
  languageCode: "pol",
  title: "Movie.Release.2024",
};
const snapshot = (streams: MediaStream[] = []): MediaMetadata => ({
  ratingKey: "42",
  title: "Movie",
  type: "movie",
  Media: [
    {
      id: 44,
      Part: [{ id: 5, key: "/library/parts/5/file.mp4", Stream: streams }],
    },
  ],
});
const version = getMediaVersions(snapshot())[0];
const attached: MediaStream = {
  id: 88,
  key: "/library/streams/88",
  sourceKey: result.sourceKey,
  streamType: 3,
  codec: "srt",
  languageCode: "pol",
  title: result.title,
};

it("uses the release filename as editable search text", () => {
  expect(defaultSubtitleSearchTitle("/movies/A Film/A.Film.1080p.mkv")).toBe(
    "A.Film.1080p",
  );
  expect(defaultSubtitleSearchTitle("D:\\Movies\\A.Film.mp4")).toBe("A.Film");
});
it("matches the provider identity despite a different attached stream id", () => {
  expect(
    findAttachedSubtitle(snapshot([attached]), version, result)?.stream,
  ).toEqual(attached);
  expect(
    findAttachedSubtitle(
      snapshot([attached]),
      { ...version, media: { ...version.media, id: 45 } },
      result,
    ),
  ).toBeUndefined();
  expect(
    findAttachedSubtitle(
      snapshot([attached]),
      { ...version, part: { ...version.part, id: 6 } },
      result,
    ),
  ).toBeUndefined();
});
it("never mistakes a coincidentally equal provider id for the attached stream", () => {
  const existing = { ...attached, id: 77, sourceKey: "provider://other" };
  const before = getMediaVersions(snapshot([existing]))[0];
  expect(
    findAttachedSubtitle(snapshot([existing, attached]), before, result)?.stream
      .id,
  ).toBe(88);
  expect(
    findAttachedSubtitle(snapshot([existing]), before, result),
  ).toBeUndefined();
});
it("only accepts an unambiguous newly attached file when a provider omits its source key", () => {
  const stream = { ...attached, sourceKey: undefined };
  expect(
    findAttachedSubtitle(snapshot([stream]), version, result)?.stream.id,
  ).toBe(88);
  expect(
    findAttachedSubtitle(
      snapshot([stream, { ...stream, id: 89 }]),
      version,
      result,
    ),
  ).toBeUndefined();
  expect(
    findAttachedSubtitle(
      snapshot([{ ...stream, key: undefined }]),
      version,
      result,
    ),
  ).toBeUndefined();
});
it("waits for actual attachment and cancels the polling delay immediately", async () => {
  vi.useFakeTimers();
  try {
    const controller = new AbortController();
    const load = vi.fn().mockResolvedValue(snapshot());
    const waiting = waitForAttachedSubtitle(
      load,
      version,
      result,
      controller.signal,
    );
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const cancelled = waiting.catch((error: Error) => error);
    controller.abort();
    await expect(cancelled).resolves.toMatchObject({ name: "AbortError" });
    await vi.runAllTimersAsync();
    expect(load).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
it("fails rather than publishing a partial download after the polling limit", async () => {
  vi.useFakeTimers();
  try {
    const load = vi.fn().mockResolvedValue(snapshot());
    const waiting = waitForAttachedSubtitle(
      load,
      version,
      result,
      new AbortController().signal,
    );
    const failed = waiting.catch((error: Error) => error);
    await vi.runAllTimersAsync();
    await expect(failed).resolves.toMatchObject({
      message: expect.stringContaining("did not become available"),
    });
    expect(load).toHaveBeenCalledTimes(40);
  } finally {
    vi.useRealTimers();
  }
});

it("does not accept a newly attached release with a different explicit provider identity", () => {
  expect(
    findAttachedSubtitle(
      snapshot([{ ...attached, sourceKey: "provider://wrong-release" }]),
      version,
      result,
    ),
  ).toBeUndefined();
});
