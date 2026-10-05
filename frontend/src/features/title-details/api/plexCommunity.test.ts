import axios from "axios";
import { AuthStorage } from "features/session/model";
import { getPlexReviews } from "./plexCommunity";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));
const post = vi.mocked(axios.post);
const reviews = {
  userReview: null,
  friendReviews: { nodes: [] },
  recentReviews: { nodes: [] },
  topReviews: { nodes: [] },
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "active-profile",
    serverToken: "server",
  });
});

it("reads Plex reviews with the active profile token and supports cancellation", async () => {
  const signal = new AbortController().signal;
  post.mockResolvedValue({ data: { data: reviews } });
  await expect(getPlexReviews("movie-id", signal)).resolves.toEqual(reviews);
  expect(post).toHaveBeenCalledWith(
    "https://community.plex.tv/api",
    expect.objectContaining({ variables: { metadataID: "movie-id" } }),
    {
      headers: { "X-Plex-Token": "active-profile" },
      timeout: 8000,
      signal,
    },
  );
});

it("rejects a missing profile session before contacting Plex", async () => {
  AuthStorage.clearActiveSession();
  await expect(getPlexReviews("movie-id")).rejects.toThrow(
    "session has expired",
  );
  expect(post).not.toHaveBeenCalled();
});

it.each([
  { errors: [{ message: "denied" }], data: reviews },
  { data: null },
  { data: { ...reviews, topReviews: { nodes: null } } },
])("rejects GraphQL failures and invalid sections", async (body) => {
  post.mockResolvedValue({ data: body });
  await expect(getPlexReviews("movie-id")).rejects.toThrow(
    "temporarily unavailable",
  );
});
