import axios from "axios";
import { AuthStorage } from "../auth/AuthStorage";
import {
  browseLibraryFolders,
  createLibrary,
  deleteLibrary,
  getManagedLibraries,
  getManagedLibrary,
  LibraryManagementError,
  runLibraryAction,
  updateLibrary,
} from "./libraries";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
  AuthStorage.setOwnerToken("owner-token");
});

it("loads libraries and browses folders through the owner-only backend", async () => {
  mockedAxios.get
    .mockResolvedValueOnce({ data: { libraries: [{ id: "1" }] } })
    .mockResolvedValueOnce({ data: { paths: [{ path: "/mnt/movies" }] } });

  await expect(getManagedLibraries()).resolves.toEqual([{ id: "1" }]);
  await expect(browseLibraryFolders("/services/browse/Lw==")).resolves.toEqual([
    { path: "/mnt/movies" },
  ]);
  expect(mockedAxios.get).toHaveBeenLastCalledWith(
    expect.stringMatching(/\/libraries\/browse$/),
    expect.objectContaining({ params: { key: "/services/browse/Lw==" } }),
  );
});

it("creates, loads, updates, acts on and deletes a library", async () => {
  mockedAxios.post.mockResolvedValue({ data: { ok: true } });
  mockedAxios.put.mockResolvedValue({ data: { ok: true } });
  mockedAxios.delete.mockResolvedValue({ data: { ok: true } });
  mockedAxios.get.mockResolvedValue({ data: { library: { id: "2" }, preferences: [] } });
  const input = {
    name: "Shows",
    type: "show" as const,
    language: "pl-PL",
    locations: ["/mnt/tvshows"],
  };

  await createLibrary(input);
  await getManagedLibrary("2");
  await updateLibrary("2", input);
  await runLibraryAction("2", "scan");
  await deleteLibrary("2", "Shows");

  expect(mockedAxios.delete).toHaveBeenCalledWith(
    expect.stringMatching(/\/libraries\/2$/),
    expect.objectContaining({ data: { confirmTitle: "Shows" } }),
  );
});

it("requires an owner token before making a request", async () => {
  localStorage.clear();
  await expect(getManagedLibraries()).rejects.toBeInstanceOf(LibraryManagementError);
  expect(mockedAxios.get).not.toHaveBeenCalled();
});

it("preserves useful backend errors", async () => {
  mockedAxios.isAxiosError.mockReturnValue(true);
  mockedAxios.post.mockRejectedValue({
    response: { status: 400, data: { error: "Invalid library configuration" } },
  });

  await expect(
    createLibrary({
      name: "Broken",
      type: "movie",
      language: "pl-PL",
      locations: [],
    }),
  ).rejects.toMatchObject({ message: "Invalid library configuration", status: 400 });
});
