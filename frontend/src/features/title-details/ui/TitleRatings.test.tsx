import type { MediaMetadata } from "entities/media/model";
import { act } from "react";
import { notifyManager } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { useAuthSession } from "features/session/model";
import { serverQueryClient as client } from "shared/api/queryClient";
import { getPlexReviews, type PlexReviews } from "../api/plexCommunity";
import TitleRatings from "./TitleRatings";
import TitleReviews from "./TitleReviews";

vi.mock("../api/plexCommunity", () => ({ getPlexReviews: vi.fn() }));
const get = vi.mocked(getPlexReviews);
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
const empty: PlexReviews = {
  userReview: null,
  friendReviews: { nodes: [] },
  recentReviews: { nodes: [] },
  topReviews: { nodes: [] },
};
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.resetAllMocks();
  client.clear();
  useAuthSession.setState({
    ownerUser: { id: 1 } as Plex.UserData,
    activeProfile: {
      id: 1,
      title: "Owner",
      protected: false,
      restricted: false,
      isOwner: true,
    },
    activeUser: { confirmed: true } as Plex.UserData,
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

it("shares one request with reviews, showing provider, own and individual friend scores on the same scale", async () => {
  const friend = {
    id: "friend",
    date: "2026-10-01",
    reviewRating: 9,
    message: "Friend opinion",
    userV2: { id: "2", username: "Alice" },
  };
  get.mockResolvedValue({
    ...empty,
    friendReviews: {
      nodes: [
        friend,
        { ...friend, id: "friend-activity" },
        { id: "other", date: "", rating: 3, userV2: { username: "Bob" } },
      ],
    },
    recentReviews: { nodes: [friend] },
    topReviews: { nodes: [friend] },
  });
  const item = {
    guid: "plex://movie/one",
    rating: 8.7,
    ratingImage: "rottentomatoes://image.rating.ripe",
    audienceRating: 9.2,
    audienceRatingImage: "rottentomatoes://image.rating.upright",
    userRating: 6,
  } as MediaMetadata;
  await act(async () =>
    root.render(
      <>
        <TitleRatings item={item} />
        <TitleReviews data={item} />
      </>,
    ),
  );
  expect(get).toHaveBeenCalledTimes(1);
  const providers = host.querySelector(
    '[aria-label="Title ratings"]',
  )!.textContent!;
  expect(providers).toContain("Rotten Tomatoes · Critics8.7/10");
  expect(providers).toContain("Rotten Tomatoes · Audience9.2/10");
  expect(providers).toContain("You6.0/10");
  const friends = host.querySelector('[aria-label="Friend ratings"]')!;
  expect(
    friends.querySelectorAll('[aria-label="Alice\'s rating"]'),
  ).toHaveLength(1);
  expect(friends.textContent).toContain("9.0/10");
  expect(friends.textContent).toContain("3.0/10");
  expect(friends.textContent).not.toContain("6.0/10");
  const section = host.querySelector('section[aria-label="Friend reviews"]')!;
  expect(section.textContent).toContain("9.0/10");
  expect(host.querySelector('section[aria-label="Top reviews"]')).toBeNull();
  expect(host.querySelector('section[aria-label="Recent reviews"]')).toBeNull();
});

it("keeps provider scores visible during a community failure and does not fabricate friend scores", async () => {
  get.mockRejectedValue(new Error("offline"));
  await act(async () =>
    root.render(
      <TitleRatings
        item={
          {
            guid: "plex://movie/one",
            rating: 8,
            ratingImage: "imdb://image.rating",
          } as MediaMetadata
        }
      />,
    ),
  );
  expect(host.textContent).toContain("IMDb8.0/10");
  expect(host.querySelector('[aria-label="Friend ratings"]')).toBeNull();
});

it("does not render missing ratings as zero and switches to the new profile's friend scores", async () => {
  get.mockResolvedValueOnce({
    ...empty,
    friendReviews: {
      nodes: [
        {
          id: "old",
          date: "",
          rating: 8,
          userV2: { username: "Old profile friend" },
        },
      ],
    },
  });
  get.mockResolvedValueOnce(empty);
  await act(async () =>
    root.render(
      <TitleRatings
        item={{ guid: "plex://movie/one", userRating: 0 } as MediaMetadata}
      />,
    ),
  );
  expect(
    host.querySelector('[aria-label="Title ratings"]')!.textContent,
  ).not.toContain("0.0/10");
  await act(async () =>
    useAuthSession.setState({
      activeProfile: {
        id: 2,
        title: "Other",
        protected: false,
        restricted: false,
        isOwner: false,
      },
    }),
  );
  expect(host.textContent).toBe("");
  expect(get).toHaveBeenCalledTimes(2);
});
