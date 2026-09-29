import { AuthStorage } from "features/session/model";
import { ProxiedRequest } from "shared/api/backend";
import { setMediaRating } from "./rating";

jest.mock("plex/QuickFunctions", () => ({
  getXPlexProps: () => ({}),
  queryBuilder: () => "rating-query",
}));
jest.mock("shared/api/backend", () => ({ ProxiedRequest: jest.fn() }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
});

it("reports whether Plex accepted a rating", async () => {
  (ProxiedRequest as jest.Mock).mockResolvedValue({ status: 200 });

  await expect(setMediaRating(8, "12")).resolves.toBe(true);
  expect(ProxiedRequest).toHaveBeenCalledWith(
    "/:/rate?rating-query",
    "GET",
    { "X-Plex-Token": "server", accept: "application/json" },
  );
});
