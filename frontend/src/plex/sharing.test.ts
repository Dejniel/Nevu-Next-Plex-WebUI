import axios from "axios";
import { AuthStorage } from "../auth/AuthStorage";
import {
  createShare,
  deleteShare,
  getSharingOverview,
  SharingError,
  updateShare,
} from "./sharing";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
  AuthStorage.setOwnerToken("owner-token");
  localStorage.setItem("clientID", "client-id");
});

it("loads shares with the owner token in headers", async () => {
  mockedAxios.get.mockResolvedValue({ data: { libraries: [], shares: [] } });

  await expect(getSharingOverview()).resolves.toEqual({ libraries: [], shares: [] });
  expect(mockedAxios.get).toHaveBeenCalledWith(
    expect.stringMatching(/\/sharing$/),
    {
      headers: {
        "X-Plex-Token": "owner-token",
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

it("fails before a request when the owner token is missing", async () => {
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
