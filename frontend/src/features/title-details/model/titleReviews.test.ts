import type { PlexReviews } from "../api/plexCommunity";
import {
  getFriendRatings,
  getReviewRating,
  partitionTitleReviews,
  replaceOwnReview,
} from "./titleReviews";

const own = {
  id: "own",
  date: "2026-01-01",
  message: "Own review",
  reviewRating: 8,
};
const friend = {
  id: "friend-review",
  date: "2026-10-01",
  message: "Friend review",
  reviewRating: 9,
  userV2: { id: "friend", username: "Friend" },
};
const popular = { id: "top", date: "2026-10-02", message: "Popular review" };
const recent = { id: "recent", date: "2026-10-03", message: "Recent review" };
const reviews: PlexReviews = {
  userReview: own,
  friendReviews: {
    nodes: [
      own,
      friend,
      {
        ...friend,
        id: "friend-rating",
        message: null,
        rating: 7,
        reviewRating: null,
      },
    ],
  },
  topReviews: { nodes: [own, popular, friend] },
  recentReviews: {
    nodes: [
      recent,
      popular,
      own,
      friend,
      recent,
      { id: "rating-only", date: "2026-10-03", rating: 5 },
    ],
  },
};

it("puts the own review first in Recent and shows each written review once", () => {
  expect(partitionTitleReviews(reviews)).toEqual({
    friends: [friend],
    top: [popular],
    recent: [own, recent],
  });
  expect(partitionTitleReviews()).toEqual({ friends: [], top: [], recent: [] });
});

it("keeps ratings without text out of review sections and does not fabricate a written own review", () => {
  expect(
    partitionTitleReviews({ ...reviews, userReview: { ...own, message: " " } })
      .recent,
  ).toEqual([recent]);
  expect(
    getReviewRating({ id: "unrated", date: "", message: "Just an opinion" }),
  ).toBeUndefined();
  expect(
    getReviewRating({ id: "zero", date: "", reviewRating: 0 }),
  ).toBeUndefined();
});

it("shows actual friend ratings once per user without computing an average or including the active profile", () => {
  expect(getFriendRatings(reviews)).toEqual([friend]);
  expect(
    getFriendRatings({
      ...reviews,
      friendReviews: {
        nodes: [
          friend,
          { id: "other", date: "", rating: 1, userV2: { username: "Other" } },
          { id: "unrated", date: "", reviewRating: 0 },
          { id: "invalid", date: "", rating: NaN },
        ],
      },
    }),
  ).toHaveLength(2);
});

it("replaces saved own reviews throughout the existing result without mutating the response", () => {
  const saved = { ...own, id: "updated-own", message: "Updated own review" };
  const updated = replaceOwnReview(reviews, saved);
  expect(updated.userReview).toEqual(saved);
  expect(updated.friendReviews.nodes[0]).toEqual(saved);
  expect(updated.topReviews.nodes[0]).toEqual(saved);
  expect(
    updated.recentReviews.nodes.find((review) => review.id === saved.id),
  ).toEqual(saved);
  expect(reviews.userReview).toEqual(own);
  expect(partitionTitleReviews(updated).recent[0]).toEqual(saved);
});

it("uses stable Plex user IDs to exclude the active profile and repeated friend activities", () => {
  const profile = { ...own, userV2: { id: "1", username: "Owner" } };
  const otherOwnActivity = {
    ...profile,
    id: "own-watch",
    userV2: { id: "1", username: "Renamed owner" },
  };
  const renamedFriend = {
    ...friend,
    id: "friend-watch",
    userV2: { id: "friend", username: "Renamed friend" },
  };
  const result = {
    ...reviews,
    userReview: profile,
    friendReviews: { nodes: [otherOwnActivity, friend, renamedFriend] },
  };
  expect(getFriendRatings(result)).toEqual([friend]);
  expect(partitionTitleReviews(result).friends).not.toContainEqual(
    otherOwnActivity,
  );
});
