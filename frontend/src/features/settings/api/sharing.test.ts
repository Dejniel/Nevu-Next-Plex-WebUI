import type { Mocked } from "vitest";
import axios from "axios";
import { AuthStorage } from "features/session/model";
import {
  createShare,
  deleteShare,
  getSharingOverview,
  SharingError,
  updateShare,
} from "./sharing";

vi.mock("axios");

const mockedAxios = axios as Mocked<typeof axios>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "manager-token",
    serverToken: "server-token",
  });
  localStorage.setItem("clientID", "client-id");
});

it("loads shares with the active manager token in headers", async () => {
  mockedAxios.get.mockResolvedValue({ data: { libraries: [], shares: [] } });

  await expect(getSharingOverview()).resolves.toEqual({ libraries: [], shares: [] });
  expect(mockedAxios.get).toHaveBeenCalledWith(
    expect.stringMatching(/\/sharing$/),
    {
      headers: {
        "X-Plex-Token": "manager-token",
        "X-Plex-Client-Identifier": "client-id",
      },
    },
  );
});

it("creates, updates and removes a share through the Nevu backend", async () => {
  mockedAxios.post.mockResolvedValue({ data: { ok: true } });
  mockedAxios.put.mockResolvedValue({ data: { ok: true } });
  mockedAxios.delete.mockResolvedValue({ data: { ok: true } });
  const access = { librarySectionIds: ["1", "2"], allowDownloads: false };

  await createShare({ ...access, invitedAccount: "friend@example.com" });
  await updateShare(42, access);
  await deleteShare(42);

  expect(mockedAxios.post).toHaveBeenCalledWith(
    expect.stringMatching(/\/sharing$/),
    { ...access, invitedAccount: "friend@example.com" },
    expect.objectContaining({ headers: expect.any(Object) }),
  );
  expect(mockedAxios.put).toHaveBeenCalledWith(
    expect.stringMatching(/\/sharing\/42$/),
    access,
    expect.objectContaining({ headers: expect.any(Object) }),
  );
  expect(mockedAxios.delete).toHaveBeenCalledWith(
    expect.stringMatching(/\/sharing\/42$/),
    expect.objectContaining({ headers: expect.any(Object) }),
  );
});

it("fails before a request when the active manager token is missing", async () => {
  localStorage.clear();

  await expect(getSharingOverview()).rejects.toBeInstanceOf(SharingError);
  expect(mockedAxios.get).not.toHaveBeenCalled();
});

it("keeps a useful backend error message", async () => {
  mockedAxios.post.mockRejectedValue({
    isAxiosError: true,
    response: { status: 422, data: { error: "Plex user was not found" } },
  });
  mockedAxios.isAxiosError.mockReturnValue(true);

  await expect(
    createShare({
      invitedAccount: "missing",
      librarySectionIds: ["1"],
      allowDownloads: true,
    }),
  ).rejects.toMatchObject({ message: "Plex user was not found", status: 422 });
});
