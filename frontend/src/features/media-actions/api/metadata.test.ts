import type { Mock } from "vitest";
import { AuthStorage } from "features/session/model";
import { ProxiedRequest } from "shared/api/backend";
import {
  applyMetadataUpdate,
  buildMetadataUpdatePath,
  getMetadataLocks,
  MetadataUpdateError,
  updateMetadata,
} from "./metadata";

vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));

const request = ProxiedRequest as Mock;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account-token",
    serverToken: "server-token",
  });
});

it("encodes editable fields in the official metadata endpoint", () => {
  expect(
    buildMetadataUpdatePath(
      "12/3",
      {
        title: "A title & more",
        summary: "First line\nSecond line",
        year: "2024",
      },
      {
        title: true,
        summary: false,
      },
    ),
  ).toBe(
    "/library/metadata/12%2F3?title.value=A+title+%26+more&summary.value=First+line%0ASecond+line&year.value=2024&title.locked=1&summary.locked=0",
  );
});

it("sends the server token and Plex API version", async () => {
  request.mockResolvedValue({ status: 200, data: "" });

  await updateMetadata("42", { title: "New title" }, { title: true });

  expect(request).toHaveBeenCalledWith(
    "/library/metadata/42?title.value=New+title&title.locked=1",
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
    Field: [
      { name: "thumb", locked: true },
      { name: "title", locked: true },
    ],
  } as Plex.Metadata;

  const updated = applyMetadataUpdate(
    metadata,
    {
      title: "New",
      sortTitle: "New sort",
      year: "2025",
    },
    { title: false, summary: true },
  );

  expect(updated).toEqual(
    expect.objectContaining({
      title: "New",
      titleSort: "New sort",
      year: 2025,
    }),
  );
  expect(updated.Field).toEqual([
    { name: "thumb", locked: true },
    { name: "summary", locked: true },
  ]);
});

it("maps Plex's sparse Field list to every editable field", () => {
  const locks = getMetadataLocks({
    Field: [
      { name: "thumb", locked: true },
      { name: "contentRating", locked: true },
    ],
  } as Plex.Metadata);

  expect(locks.contentRating).toBe(true);
  expect(locks.title).toBe(false);
  expect(locks.summary).toBe(false);
});

it("can update only a lock without changing its value", async () => {
  request.mockResolvedValue({ status: 200, data: "" });

  await updateMetadata("42", {}, { summary: false });

  expect(request).toHaveBeenCalledWith(
    "/library/metadata/42?summary.locked=0",
    "PUT",
    expect.any(Object),
    {},
  );
});
