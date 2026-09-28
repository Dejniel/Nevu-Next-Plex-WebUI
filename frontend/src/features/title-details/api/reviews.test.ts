import axios from "axios";
import { AuthStorage } from "auth/AuthStorage";
import {
  deleteNevuReview,
  getNevuReviews,
  ReviewError,
  updateNevuReview,
} from "./reviews";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "profile-token",
    serverToken: "server-token",
  });
  localStorage.setItem("clientID", "client-id");
});

it("loads reviews with the active profile identity", async () => {
  const reviews = [{ itemID: "plex://movie/1", visibility: "LOCAL" }];
  mockedAxios.get.mockResolvedValue({ data: reviews });

  await expect(getNevuReviews("plex://movie/1", "user-1")).resolves.toEqual(reviews);
  expect(mockedAxios.get).toHaveBeenCalledWith(
    expect.stringMatching(/\/reviews$/),
    {
      params: { itemID: "plex://movie/1", userID: "user-1" },
      headers: {
        "X-Plex-Token": "profile-token",
        "X-Plex-Client-Identifier": "client-id",
      },
    },
  );
});

it("keeps an empty optional review message unchanged", async () => {
  mockedAxios.post.mockResolvedValue({ data: { ok: true } });

  await updateNevuReview("plex://movie/1", 8, "", "LOCAL", false);

  expect(mockedAxios.post).toHaveBeenCalledWith(
    expect.stringMatching(/\/reviews$/),
    {
      itemID: "plex://movie/1",
      rating: 8,
      message: "",
      visibility: "LOCAL",
      spoilers: false,
    },
    expect.objectContaining({ headers: expect.any(Object) }),
  );
});

it("rejects malformed responses instead of returning an error as a review list", async () => {
  mockedAxios.get.mockResolvedValue({ data: { error: "broken" } });

  await expect(getNevuReviews("plex://movie/1")).rejects.toMatchObject({
    name: "ReviewError",
    message: "Nevu returned an invalid reviews response.",
  });
});

it("preserves backend errors for failed review operations", async () => {
  mockedAxios.isAxiosError.mockReturnValue(true);
  mockedAxios.delete.mockRejectedValue({
    response: { status: 502, data: { error: "Community service unavailable" } },
  });

  await expect(
    deleteNevuReview("plex://movie/1", "GLOBAL"),
  ).rejects.toMatchObject({
    message: "Community service unavailable",
    status: 502,
  });
});

it("fails before a request when the profile token is missing", async () => {
  localStorage.clear();

  await expect(getNevuReviews("plex://movie/1")).rejects.toBeInstanceOf(ReviewError);
  expect(mockedAxios.get).not.toHaveBeenCalled();
});
