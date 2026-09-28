import axios from "axios";
import { AuthStorage } from "../../../auth/AuthStorage";
import {
  getLibraryPage,
  LibraryPageError,
  PLEX_SESSION_INVALID_EVENT,
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
  jest.restoreAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
});

it("preserves backend retryability in range errors", async () => {
  jest.spyOn(axios, "get").mockRejectedValue({
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
  const get = jest.spyOn(axios, "get").mockResolvedValue({
    data: { offset: 0, size: 0, totalSize: 0, hasMore: false, items: [] },
  });
  const filterExpression = {
    kind: "group" as const,
    mode: "and" as const,
    children: [{
      kind: "group" as const,
      mode: "or" as const,
      children: [
        { kind: "clause" as const, field: "genre", operator: "=" as const, value: "4", valueLabel: "Action" },
        { kind: "clause" as const, field: "genre", operator: "=" as const, value: "5", valueLabel: "Comedy" },
      ],
    }, {
      kind: "clause" as const,
      field: "unwatched",
      operator: "=" as const,
      value: "1",
    }],
  };

  await getLibraryPage({
    ...request,
    filterExpression,
  });

  expect(JSON.parse(get.mock.calls[0][1]?.params.filterExpression)).toEqual(
    normalizeLibraryFilterExpression(filterExpression),
  );
  expect(get.mock.calls[0][1]?.params.filterExpression).not.toContain("valueLabel");
});

it("forwards an allowlisted collection source to the backend", async () => {
  const get = jest.spyOn(axios, "get").mockResolvedValue({
    data: { offset: 0, size: 0, totalSize: 0, hasMore: false, items: [] },
  });

  await getLibraryPage({ ...request, source: "onDeck" });

  expect(get.mock.calls[0][1]?.params.source).toBe("onDeck");
});

it("notifies the auth boundary when Plex rejects the active token", async () => {
  const listener = jest.fn();
  window.addEventListener(PLEX_SESSION_INVALID_EVENT, listener);
  jest.spyOn(axios, "get").mockRejectedValue({
    isAxiosError: true,
    response: { status: 401, data: { error: "Session expired", retryable: false } },
  });

  await expect(getLibraryPage(request)).rejects.toMatchObject({ status: 401 });
  expect(listener).toHaveBeenCalledTimes(1);
  window.removeEventListener(PLEX_SESSION_INVALID_EVENT, listener);
});
