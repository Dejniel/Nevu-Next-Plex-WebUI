import axios from "axios";
import { AuthStorage } from "../auth/AuthStorage";
import {
  getLibraryPage,
  LibraryPageError,
  PLEX_SESSION_INVALID_EVENT,
} from "./libraryPage";

const request = {
  sectionId: 1,
  filter: "all" as const,
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
