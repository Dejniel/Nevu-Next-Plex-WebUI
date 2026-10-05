import type { Mock } from "vitest";
import { AuthStorage } from "features/session/model";
import { ProxiedRequest } from "shared/api/backend";
import { setMediaRating } from "./rating";

vi.mock("features/session/model", async () => ({
  ...(await vi.importActual<typeof import("features/session/model")>(
    "features/session/model",
  )),
  getXPlexProps: () => ({}),
}));
vi.mock("shared/lib/query", () => ({
  queryBuilder: () => "rating-query",
}));
vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
});

it("reports whether Plex accepted a rating", async () => {
  (ProxiedRequest as Mock).mockResolvedValue({ status: 200 });

  await expect(setMediaRating(8, "12")).resolves.toBe(true);
  expect(ProxiedRequest).toHaveBeenCalledWith("/:/rate?rating-query", "GET", {
    "X-Plex-Token": "server",
    accept: "application/json",
  });
});
