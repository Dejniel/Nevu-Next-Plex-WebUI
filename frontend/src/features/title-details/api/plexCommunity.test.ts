import axios from "axios";
import { AuthStorage, useAuthSession } from "features/session/model";
import { getPlexReviews, savePlexReview } from "./plexCommunity";

vi.mock("axios", async (importOriginal) => ({
  default: {
    ...(await importOriginal<typeof import("axios")>()).default,
    post: vi.fn(),
  },
}));
const post = vi.mocked(axios.post);
const reviews = {
  userReview: null,
  friendReviews: { nodes: [] },
  recentReviews: { nodes: [] },
  topReviews: { nodes: [] },
};

beforeEach(() => {
  vi.resetAllMocks();
  useAuthSession.setState({ status: "ready", revision: 1 });
  localStorage.clear();
  sessionStorage.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "active-profile",
    serverToken: "server",
  });
});

it.each(["profile", "sign-out", "abort"])(
  "ignores a late cloud response after %s",
  async (change) => {
    let finish!: (value: unknown) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = getPlexReviews("movie-id", controller.signal);
    if (change === "profile") useAuthSession.setState({ revision: 2 });
    else if (change === "sign-out")
      useAuthSession.setState({ status: "signedOut" });
    else controller.abort();
    finish({ data: { data: reviews } });
    await expect(pending).rejects.toThrow();
  },
);

it("does not retain request credentials when a community request fails", async () => {
  post.mockRejectedValue({
    isAxiosError: true,
    config: { headers: { "X-Plex-Token": "private" } },
  });
  const error = await getPlexReviews("movie-id").catch((error) => error);
  expect(error.message).toContain("temporarily unavailable");
  expect(error).not.toHaveProperty("config");
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
  { data: null },
  { data: { ...reviews, topReviews: { nodes: null } } },
])("rejects invalid review responses", async (body) => {
  post.mockResolvedValue({ data: body });
  await expect(getPlexReviews("movie-id")).rejects.toThrow();
});

it("preserves Plex account eligibility errors instead of reporting a saved review", async () => {
  post.mockResolvedValue({
    data: {
      data: { createReview: { id: "saved" } },
      errors: [{ message: "Verify your Plex email first" }],
    },
  });
  await expect(
    savePlexReview({
      metadata: "movie",
      message: "Review",
      hasSpoilers: false,
      rating: null,
    }),
  ).rejects.toThrow("Verify your Plex email first");
});

it.each([undefined, "own-review"])(
  "creates or updates the active profile's review without changing its rating",
  async (reviewID) => {
    const operation = reviewID ? "updateReview" : "createReview";
    const input = {
      metadata: "movie",
      message: "Review",
      hasSpoilers: true,
      rating: 8,
    };
    const saved = {
      id: "own-review",
      date: "2026-10-05",
      reviewRating: 8,
      message: "Review",
      hasSpoilers: true,
    };
    post.mockResolvedValue({ data: { data: { [operation]: saved } } });
    const signal = new AbortController().signal;
    await expect(savePlexReview(input, reviewID, signal)).resolves.toEqual(
      saved,
    );
    expect(post).toHaveBeenCalledWith(
      "https://community.plex.tv/api",
      expect.objectContaining({
        operationName: operation,
        variables: { input, ...(reviewID ? { id: reviewID } : {}) },
      }),
      { headers: { "X-Plex-Token": "active-profile" }, timeout: 8000, signal },
    );
  },
);

it("requires confirmation from Plex before reporting a successful save", async () => {
  post.mockResolvedValue({ data: { data: { createReview: null } } });
  await expect(
    savePlexReview({
      metadata: "movie",
      message: "Review",
      hasSpoilers: false,
      rating: null,
    }),
  ).rejects.toThrow("did not confirm");
});
