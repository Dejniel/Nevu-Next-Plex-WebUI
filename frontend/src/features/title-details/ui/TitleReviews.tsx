import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Divider,
  Grid,
  Paper,
  Skeleton,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion } from "motion/react";
import { useActiveServerScope, useAuthSession } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import type { PlexReview } from "../api/plexCommunity";
import { titleReviewsQueryOptions } from "../model/titleReviewsQuery";
import { getReviewRating, partitionTitleReviews } from "../model/titleReviews";
import { MediaRatingValue } from "entities/media/public";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function ReviewsHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1.5,
        mb: 2,
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: "bold" }}>
        {title}
      </Typography>
      {action && <Box sx={{ ml: "auto" }}>{action}</Box>}
    </Box>
  );
}

function ReviewsSection({
  title,
  reviews,
  action,
  loading = false,
}: {
  title: string;
  reviews: PlexReview[];
  action?: ReactNode;
  loading?: boolean;
}) {
  if (!reviews.length && !action && !loading) return null;
  return (
    <Box component="section" aria-label={title} sx={{ width: "100%" }}>
      <ReviewsHeading title={title} action={action} />
      {loading ? (
        <Skeleton variant="rounded" height={160} />
      ) : !reviews.length ? (
        <Typography color="text.secondary">No recent reviews yet.</Typography>
      ) : (
        <Grid container spacing={3}>
          {reviews.map((review) => {
            const username =
              review.userV2?.displayName ||
              review.userV2?.username ||
              "Anonymous User";
            const date = new Date(review.date);
            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={review.id}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    height: "100%",
                    bgcolor: (theme) =>
                      alpha(theme.palette.background.paper, 0.4),
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      mb: 2,
                    }}
                  >
                    <Avatar src={review.userV2?.avatar}>
                      {username.charAt(0)}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: "medium" }}>
                        {username}
                      </Typography>
                      <MediaRatingValue value={getReviewRating(review)} />
                      {!Number.isNaN(date.getTime()) && (
                        <Typography
                          variant="caption"
                          component="time"
                          dateTime={date.toISOString()}
                          sx={{ display: "block", color: "text.secondary" }}
                        >
                          {dateFormat.format(date)}
                        </Typography>
                      )}
                      {review.status === "PENDING" && (
                        <Typography variant="caption" color="text.secondary">
                          Your review is awaiting moderation.
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  {review.message && (
                    <>
                      <Divider sx={{ mb: 2 }} />
                      {review.hasSpoilers ? (
                        <Box component="details">
                          <Typography
                            component="summary"
                            sx={{ cursor: "pointer" }}
                          >
                            Show spoilers
                          </Typography>
                          <Typography
                            sx={{
                              mt: 1,
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {review.message}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography
                          sx={{
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {review.message}
                        </Typography>
                      )}
                    </>
                  )}
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}

export default function TitleReviews({
  data,
  onWriteReview,
}: {
  data: Plex.Metadata | undefined;
  onWriteReview?: () => void;
}) {
  const { profileKey } = useActiveServerScope();
  const confirmed = useAuthSession((state) => state.activeUser?.confirmed);
  const result = useQuery(
    titleReviewsQueryOptions(profileKey, data?.guid),
    serverQueryClient,
  );
  const reviews = result.data;
  const loading = result.isPending && result.isFetching;
  const { top, recent, friends } = partitionTitleReviews(reviews);
  const critics = data?.Review || [];
  const reviewAction = onWriteReview && (
    <Button
      variant="outlined"
      disabled={!reviews || confirmed === false}
      onClick={onWriteReview}
    >
      Write your own review
    </Button>
  );

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      sx={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}
    >
      {confirmed === false && (
        <Alert severity="info">
          Writing reviews requires a verified Plex account.
        </Alert>
      )}
      {result.isError && (
        <Alert severity="warning">
          Plex community reviews are temporarily unavailable.
        </Alert>
      )}
      {critics.length > 0 && (
        <Box component="section" aria-label="Critic reviews">
          <ReviewsHeading title="Critic reviews" action={reviewAction} />
          <Grid container spacing={3}>
            {critics.map((review) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={review.id}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    height: "100%",
                    bgcolor: (theme) =>
                      alpha(theme.palette.background.paper, 0.4),
                  }}
                >
                  <Typography sx={{ fontWeight: "bold" }}>
                    {review.tag}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "text.secondary", mb: 2 }}
                  >
                    {review.source}
                  </Typography>
                  <Typography sx={{ lineHeight: 1.6 }}>
                    {review.text}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
      {!loading &&
        !result.isError &&
        !reviewAction &&
        !critics.length &&
        !top.length &&
        !recent.length &&
        !friends.length && (
          <Typography color="text.secondary">
            No reviews available for this title yet.
          </Typography>
        )}
      <ReviewsSection
        title="Recent reviews"
        reviews={recent}
        action={reviewAction}
        loading={loading}
      />
      <ReviewsSection title="Top reviews" reviews={top} />
      <ReviewsSection title="Friend reviews" reviews={friends} />
    </Box>
  );
}
