import { AuthStorage, useServerSession } from "features/session/model";
import { ProxiedRequest } from "shared/api/backend";
import { PlexRequestError } from "shared/api/PlexClient";
import type { PlexPlaybackSource } from "entities/media/model";
import {
  getPlaybackQueueForItem,
  getTimelineUpdate,
  putAudioStream,
  putSubtitleStream,
} from "./playback";

vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));
const request = vi.mocked(ProxiedRequest);
const movie = { ratingKey: "42", type: "movie", title: "Movie" };
const source: PlexPlaybackSource = {
  id: "owned-source",
  url: "/stream",
  type: "dash",
  requestContext: {
    "X-Plex-Token": "source-token",
    "X-Plex-Client-Identifier": "client",
  },
};

beforeEach(() => {
  request.mockReset();
  localStorage.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account-token",
    serverToken: "current-token",
  });
  useServerSession.setState({
    server: { machineIdentifier: "server" } as Plex.ServerPreferences,
  });
});

it("refuses unidentified track selections before sending a Plex mutation", async () => {
  await expect(putAudioStream(undefined, 3)).rejects.toThrow(
    "cannot be selected",
  );
  await expect(putAudioStream(4, undefined)).rejects.toThrow(
    "cannot be selected",
  );
  await expect(putSubtitleStream(0, 3)).rejects.toThrow("cannot be selected");
  expect(request).not.toHaveBeenCalled();
});

it("creates a video queue using the known server without fetching its root again", async () => {
  request.mockResolvedValue({
    status: 200,
    data: { MediaContainer: { Metadata: [movie] } },
  } as never);
  const signal = new AbortController().signal;
  await expect(
    getPlaybackQueueForItem(movie.ratingKey, signal),
  ).resolves.toEqual([movie]);
  expect(request).toHaveBeenCalledTimes(1);
  const [path, method, headers, body, cancellation] = request.mock.calls[0];
  const url = new URL(path, "http://plex");
  expect(url.pathname).toBe("/playQueues");
  expect(url.searchParams.get("uri")).toBe(
    "server://server/com.plexapp.plugins.library/library/metadata/42",
  );
  expect(url.searchParams.get("type")).toBe("video");
  expect(url.searchParams.get("continuous")).toBe("1");
  expect(method).toBe("POST");
  expect(headers?.["X-Plex-Token"]).toBe("current-token");
  expect(body).toBeUndefined();
  expect(cancellation).toBe(signal);
});

it("rejects a missing server session before sending a queue request", async () => {
  useServerSession.setState({ server: null });
  await expect(getPlaybackQueueForItem(movie.ratingKey)).rejects.toThrow(
    "active Plex server is unavailable",
  );
  expect(request).not.toHaveBeenCalled();
});

it.each([{}, { Metadata: [] }])(
  "accepts an empty queue container (%j)",
  async (MediaContainer) => {
    request.mockResolvedValue({
      status: 200,
      data: { MediaContainer },
    } as never);
    await expect(getPlaybackQueueForItem(movie.ratingKey)).resolves.toEqual([]);
  },
);

it.each([
  {},
  { MediaContainer: "invalid" },
  { MediaContainer: [] },
  { MediaContainer: { Metadata: null } },
  { MediaContainer: { Metadata: {} } },
])("rejects an invalid queue response (%j)", async (data) => {
  request.mockResolvedValue({ status: 200, data } as never);
  await expect(getPlaybackQueueForItem(movie.ratingKey)).rejects.toThrow(
    "invalid playback queue",
  );
});

it.each([
  null,
  [],
  { ...movie, ratingKey: 42 },
  { ...movie, ratingKey: "remote" },
  { ...movie, type: "track" },
  { ...movie, type: ["movie"] },
  { ...movie, title: null },
  { ...movie, summary: {} },
  { ...movie, thumb: [] },
  { ...movie, index: 1.5 },
  { ...movie, viewOffset: "1000" },
  { ...movie, viewOffset: -1 },
  { ...movie, playlistItemID: 0 },
  { ...movie, playQueueItemID: Infinity },
])(
  "rejects a malformed queue occurrence before publishing it (%j)",
  async (item) => {
    request.mockResolvedValue({
      status: 200,
      data: { MediaContainer: { Metadata: [item] } },
    });
    await expect(getPlaybackQueueForItem(movie.ratingKey)).rejects.toThrow(
      "invalid playback queue",
    );
  },
);

it("preserves repeated occurrences, resume position and preview fields without pretending they are full metadata", async () => {
  const first = {
    ...movie,
    playQueueItemID: 80,
    viewOffset: 5000,
    index: 0,
    thumb: "/preview",
    summary: "Next title",
  };
  const second = { ...first, playQueueItemID: 81, playlistItemID: 23 };
  request.mockResolvedValue({
    status: 200,
    data: {
      MediaContainer: { size: 2, Metadata: [{ ...first, Media: [] }, second] },
    },
  });
  await expect(getPlaybackQueueForItem(movie.ratingKey)).resolves.toEqual([
    first,
    second,
  ]);
});

it.each([1, -1, 0.5, "0"])(
  "rejects an inconsistent queue size (%j)",
  async (size) => {
    request.mockResolvedValue({
      status: 200,
      data: { MediaContainer: { size } },
    });
    await expect(getPlaybackQueueForItem(movie.ratingKey)).rejects.toThrow(
      "invalid playback queue",
    );
  },
);

it.each([401, 403, 404, 503])(
  "preserves queue HTTP errors (%s)",
  async (status) => {
    request.mockResolvedValue({ status, data: "Plex failure" } as never);
    await expect(
      getPlaybackQueueForItem(movie.ratingKey),
    ).rejects.toMatchObject({ status, response: "Plex failure" });
  },
);

it("preserves a transport failure instead of returning an empty queue", async () => {
  const failure = new Error("Network unavailable");
  request.mockRejectedValue(failure);
  await expect(getPlaybackQueueForItem(movie.ratingKey)).rejects.toBe(failure);
});

it.each([
  [putAudioStream, "audioStreamID", 10],
  [putSubtitleStream, "subtitleStreamID", 0],
] as const)(
  "writes selected streams and forwards cancellation",
  async (write, field, id) => {
    request.mockResolvedValue({ status: 204, data: "" } as never);
    const signal = new AbortController().signal;
    await write(20, id, signal);
    const [path, method, headers, body, cancellation] = request.mock.calls[0];
    const url = new URL(path, "http://plex");
    expect(url.pathname).toBe("/library/parts/20");
    expect(url.searchParams.get(field)).toBe(String(id));
    expect(method).toBe("PUT");
    expect(headers?.["X-Plex-Token"]).toBe("current-token");
    expect(body).toEqual({});
    expect(cancellation).toBe(signal);
  },
);

it("does not swallow a failed track selection", async () => {
  request.mockResolvedValue({ status: 403, data: "denied" } as never);
  await expect(putAudioStream(20, 10)).rejects.toBeInstanceOf(PlexRequestError);
});

it("reports progress with the source's token and session after the active profile changes", async () => {
  request.mockResolvedValue({
    status: 200,
    data: {
      MediaContainer: { terminationCode: 1000, terminationText: "Stopped" },
    },
  } as never);
  await expect(
    getTimelineUpdate(42, 100000, "paused", 7250, source),
  ).resolves.toEqual({ terminationCode: 1000, terminationText: "Stopped" });
  const [path, method, headers] = request.mock.calls[0];
  const url = new URL(path, "http://plex");
  expect(url.pathname).toBe("/:/timeline");
  expect(url.searchParams.get("X-Plex-Session-Identifier")).toBe(
    "owned-source",
  );
  expect(url.searchParams.get("X-Plex-Token")).toBe("source-token");
  expect(url.searchParams.get("time")).toBe("7250");
  expect(url.searchParams.get("playbackTime")).toBe("7250");
  expect(url.searchParams.get("duration")).toBe("100000");
  expect(url.searchParams.get("state")).toBe("paused");
  expect(method).toBe("GET");
  expect(headers?.["X-Plex-Token"]).toBe("source-token");
});

it.each([200, 204])(
  "accepts an empty successful timeline acknowledgement (%s)",
  async (status) => {
    request.mockResolvedValue({ status, data: "" } as never);
    await expect(
      getTimelineUpdate(42, 100000, "stopped", 7250, source),
    ).resolves.toEqual({});
  },
);

it.each([
  {},
  { MediaContainer: [] },
  { MediaContainer: { terminationCode: "1000" } },
  { MediaContainer: { terminationCode: NaN } },
  { MediaContainer: { terminationText: {} } },
])(
  "does not confuse malformed timeline data with an empty acknowledgement (%j)",
  async (data) => {
    request.mockResolvedValue({ status: 200, data });
    await expect(
      getTimelineUpdate(42, 100000, "playing", 7250, source),
    ).rejects.toThrow("invalid playback timeline");
  },
);

it("leaves handling of a timeline HTTP failure to the reporting controller", async () => {
  request.mockResolvedValue({ status: 503, data: "unavailable" } as never);
  await expect(
    getTimelineUpdate(42, 100000, "playing", 7250, source),
  ).rejects.toMatchObject({ status: 503 });
});
