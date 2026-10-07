import { validMediaRating } from "entities/media/model";
import type { PlexReview, PlexReviews } from "../api/plexCommunity";

export function getReviewRating(review: PlexReview) {
  const value = review.reviewRating ?? review.rating;
  return validMediaRating(value) && value > 0 ? value : undefined;
}

function reviewerKey(review?: PlexReview | null) {
  if (!review) return undefined;
  const user = review.userV2;
  return user?.id
    ? `id:${user.id}`
    : user?.username
      ? `username:${user.username}`
      : `activity:${review.id}`;
}

export function getFriendRatings(reviews?: PlexReviews) {
  const users = new Set([reviewerKey(reviews?.userReview)]);
  return (reviews?.friendReviews.nodes ?? []).filter((review) => {
    const user = reviewerKey(review);
    if (
      review.id === reviews?.userReview?.id ||
      users.has(user) ||
      getReviewRating(review) === undefined
    )
      return false;
    users.add(user);
    return true;
  });
}

export function partitionTitleReviews(reviews?: PlexReviews) {
  const seen = new Set([reviews?.userReview?.id]);
  const ownUser = reviewerKey(reviews?.userReview);
  const take = (nodes: PlexReview[] = []) =>
    nodes.filter((review) => {
      if (
        !review.message?.trim() ||
        seen.has(review.id) ||
        reviewerKey(review) === ownUser
      )
        return false;
      seen.add(review.id);
      return true;
    });
  const friends = take(reviews?.friendReviews.nodes);
  const top = take(reviews?.topReviews.nodes);
  const recent = take(reviews?.recentReviews.nodes);
  if (reviews?.userReview?.message?.trim()) recent.unshift(reviews.userReview);
  return { friends, top, recent };
}

export function replaceOwnReview(
  reviews: PlexReviews,
  saved: PlexReview,
): PlexReviews {
  const replace = ({ nodes }: { nodes: PlexReview[] }) => ({
    nodes: nodes.map((review) =>
      review.id === saved.id || review.id === reviews.userReview?.id
        ? saved
        : review,
    ),
  });
  return {
    userReview: saved,
    friendReviews: replace(reviews.friendReviews),
    topReviews: replace(reviews.topReviews),
    recentReviews: replace(reviews.recentReviews),
  };
}
