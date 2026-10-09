import axios from "axios";
import {
  AuthStorage,
  PLEX_SESSION_INVALID_EVENT,
} from "features/session/model";
import {
  getLibraryPage,
  LibraryPageError,
  synchronizeLibraryItem,
} from "./libraryPage";
import { normalizeLibraryFilterExpression } from "../model/libraryFilterExpression";

const request = {
  sectionId: 1,
  sort: "title:asc" as const,
  offset: 0,
  size: 64,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
});

it("decodes canonical synchronization metadata before sharing it with any cache", async () => {
  const item = {
    ratingKey: "1",
    type: "movie",
    title: "Movie",
    guid: "local://1",
  };
  const post = vi.spyOn(axios, "post").mockResolvedValue({
    data: {
      item,
      sectionId: "2",
      parentIds: [],
      metadata: {
        ...item,
        ignored: "untrusted",
        Media: [
          {
            Part: [
              {
                key: "/library/parts/1/file",
                Stream: [{ streamType: 2, selected: 1 }],
              },
            ],
          },
        ],
      },
    },
  });
  const signal = new AbortController().signal;
  const update = await synchronizeLibraryItem("1", signal, true);
  expect(update.metadata?.Media?.[0]?.Part?.[0]?.Stream?.[0].selected).toBe(
    true,
  );
  expect(update.metadata).not.toHaveProperty("ignored");
  expect(update.item).toEqual(item);
  expect(post.mock.calls[0][2]).toMatchObject({
    params: { id: "1", includeDetails: "true" },
    signal,
    headers: { "X-Plex-Token": "server" },
  });
});

it.each([
  { ratingKey: "wrong", type: "movie", title: "Wrong item" },
  {
    ratingKey: "1",
    type: "movie",
    title: "Movie",
    Media: [{ Part: [{ Stream: {} }] }],
  },
])(
  "rejects unchecked sync metadata, including a mismatched identity (%j)",
  async (metadata) => {
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { item: null, metadata },
    });
    await expect(
      synchronizeLibraryItem("1", new AbortController().signal, true),
    ).rejects.toThrow("invalid media metadata");
  },
);

it("preserves deleted-item and summary-only synchronization results", async () => {
  const update = { item: null, sectionId: "2", parentIds: ["3"] };
  vi.spyOn(axios, "post").mockResolvedValue({ data: update });
  await expect(
    synchronizeLibraryItem("1", new AbortController().signal),
  ).resolves.toEqual(update);
});

it("preserves backend retryability in range errors", async () => {
  vi.spyOn(axios, "get").mockRejectedValue({
    isAxiosError: true,
    response: {
      status: 502,
      data: { error: "Malformed Plex page", retryable: false },
    },
  });

  await expect(getLibraryPage(request)).rejects.toEqual(
    new LibraryPageError("Malformed Plex page", false, 502),
  );
});

it("serializes nested filter expressions without client-only labels", async () => {
  const get = vi.spyOn(axios, "get").mockResolvedValue({
    data: { offset: 0, size: 0, totalSize: 0, hasMore: false, items: [] },
  });
  const filterExpression = {
    kind: "group" as const,
    mode: "and" as const,
    children: [
      {
        kind: "group" as const,
        mode: "or" as const,
        children: [
          {
            kind: "clause" as const,
            field: "genre",
            operator: "=" as const,
            value: "4",
            valueLabel: "Action",
          },
          {
            kind: "clause" as const,
            field: "genre",
            operator: "=" as const,
            value: "5",
            valueLabel: "Comedy",
          },
        ],
      },
      {
        kind: "clause" as const,
        field: "unwatched",
        operator: "=" as const,
        value: "1",
      },
    ],
  };

  await getLibraryPage({
    ...request,
    filterExpression,
  });

  expect(get.mock.calls[0][1]).toMatchObject({
    params: {
      filterExpression: JSON.stringify(
        normalizeLibraryFilterExpression(filterExpression),
      ),
    },
  });
  expect(get.mock.calls[0][1]).toMatchObject({
    params: { filterExpression: expect.not.stringContaining("valueLabel") },
  });
});

it("forwards an allowlisted collection source to the backend", async () => {
  const get = vi.spyOn(axios, "get").mockResolvedValue({
    data: { offset: 0, size: 0, totalSize: 0, hasMore: false, items: [] },
  });

  await getLibraryPage({ ...request, source: "onDeck" });

  expect(get.mock.calls[0][1]).toMatchObject({ params: { source: "onDeck" } });
});

it("notifies the auth boundary when Plex rejects the active token", async () => {
  const listener = vi.fn();
  window.addEventListener(PLEX_SESSION_INVALID_EVENT, listener);
  vi.spyOn(axios, "get").mockRejectedValue({
    isAxiosError: true,
    response: {
      status: 401,
      data: { error: "Session expired", retryable: false },
    },
  });

  await expect(getLibraryPage(request)).rejects.toMatchObject({ status: 401 });
  expect(listener).toHaveBeenCalledTimes(1);
  window.removeEventListener(PLEX_SESSION_INVALID_EVENT, listener);
});
