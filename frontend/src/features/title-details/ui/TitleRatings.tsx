import { Avatar, Box, Tooltip, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import {
  getMediaRatings,
  mediaRatingLabel,
  MediaRatingValue,
} from "entities/media/public";
import { useActiveServerScope } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { titleReviewsQueryOptions } from "../model/titleReviewsQuery";
import { getFriendRatings, getReviewRating } from "../model/titleReviews";

export default function TitleRatings({ item }: { item?: Plex.Metadata }) {
  const { profileKey } = useActiveServerScope();
  const reviews = useQuery(
    titleReviewsQueryOptions(profileKey, item?.guid),
    serverQueryClient,
  );
  const ratings = item ? getMediaRatings(item) : [];
  const friends = getFriendRatings(reviews.data);
  if (!ratings.length && !friends.length) return null;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box
        aria-label="Title ratings"
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: { xs: "center", sm: "flex-start" },
          gap: 2,
        }}
      >
        {ratings.map((rating) => (
          <Box
            key={`${rating.source}:${rating.kind}:${rating.value}`}
            sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <Typography variant="body2" color="text.secondary">
              {mediaRatingLabel(rating)}
            </Typography>
            <MediaRatingValue value={rating.value} />
          </Box>
        ))}
      </Box>
      {friends.length > 0 && (
        <Box
          aria-label="Friend ratings"
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: { xs: "center", sm: "flex-start" },
            gap: 1.5,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Friends
          </Typography>
          {friends.map((review) => {
            const name =
              review.userV2?.displayName ||
              review.userV2?.username ||
              "Plex user";
            const value = getReviewRating(review);
            return (
              <Tooltip key={review.id} title={`${name} · Plex`}>
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                  aria-label={`${name}'s rating`}
                >
                  <Avatar
                    src={review.userV2?.avatar}
                    alt={name}
                    sx={{ width: 24, height: 24 }}
                  >
                    {name.charAt(0)}
                  </Avatar>
                  <MediaRatingValue value={value} />
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
