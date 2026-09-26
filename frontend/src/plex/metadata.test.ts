import { AuthStorage } from "../auth/AuthStorage";
import { ProxiedRequest } from "../backendURL";
import {
  applyMetadataUpdate,
  buildMetadataUpdatePath,
  MetadataUpdateError,
  updateMetadata,
} from "./metadata";

jest.mock("../backendURL", () => ({ ProxiedRequest: jest.fn() }));

const request = ProxiedRequest as jest.Mock;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account-token",
    serverToken: "server-token",
  });
});

it("encodes editable fields in the official metadata endpoint", () => {
  expect(
    buildMetadataUpdatePath("12/3", {
      title: "A title & more",
      summary: "First line\nSecond line",
      year: "2024",
    }),
  ).toBe(
    "/library/metadata/12%2F3?title=A+title+%26+more&summary=First+line%0ASecond+line&year=2024",
  );
});

it("sends the server token and Plex API version", async () => {
  request.mockResolvedValue({ status: 200, data: "" });

  await updateMetadata("42", { title: "New title" });

  expect(request).toHaveBeenCalledWith(
    "/library/metadata/42?title=New+title",
    "PUT",
    expect.objectContaining({
      "X-Plex-Token": "server-token",
      "X-Plex-Pms-Api-Version": "1.0.0",
    }),
    {},
  );
});

it("reports missing administrator access", async () => {
  request.mockResolvedValue({ status: 403, data: "Forbidden" });

  await expect(updateMetadata("42", { title: "New title" })).rejects.toEqual(
    expect.objectContaining<Partial<MetadataUpdateError>>({
      status: 403,
      message: expect.stringContaining("administrator"),
    }),
  );
});

it("applies saved field names to the local Plex metadata model", () => {
  const metadata = {
    title: "Old",
    titleSort: "Old",
    year: 2000,
  } as Plex.Metadata;

  expect(
    applyMetadataUpdate(metadata, {
      title: "New",
      sortTitle: "New sort",
      year: "2025",
    }),
  ).toEqual(expect.objectContaining({ title: "New", titleSort: "New sort", year: 2025 }));
});
