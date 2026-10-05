import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Divider,
  Grid,
  Paper,
  Rating,
  Skeleton,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion } from "motion/react";
import { useAuthSession } from "features/session/public";
import {
  getPlexReviews,
  type PlexReview,
  type PlexReviews,
} from "../api/plexCommunity";
import PlexReviewDialog from "./PlexReviewDialog";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function ReviewsSection({
  title,
  reviews,
}: {
  title: string;
  reviews: PlexReview[];
}) {
  if (!reviews.length) return null;
  return (
    <Box sx={{ width: "100%" }}>
      <Typography variant="h6" sx={{ fontWeight: "bold", mb: 2 }}>
        {title}
      </Typography>
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
                    <Rating
                      value={(review.reviewRating ?? review.rating ?? 0) / 2}
                      precision={0.5}
                      size="small"
                      readOnly
                    />
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
    </Box>
  );
}

export default function TitleReviews({
  data,
}: {
  data: Plex.Metadata | undefined;
}) {
  const sessionRevision = useAuthSession((state) => state.revision);
  const confirmed = useAuthSession((state) => state.activeUser?.confirmed);
  const metadataID = data?.guid.match(
    /^plex:\/\/(?:movie|show|season|episode)\/([^/]+)$/,
  )?.[1];
  const [reviews, setReviews] = useState<PlexReviews | null>(null);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setReviews(null);
    setWarning(null);
    setEditing(false);
    if (!metadataID) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    getPlexReviews(metadataID, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setReviews(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setWarning("Plex community reviews are temporarily unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [metadataID, sessionRevision]);

  const top = reviews?.topReviews.nodes || [];
  const topIDs = new Set(top.map((review) => review.id));
  const recent =
    reviews?.recentReviews.nodes.filter((review) => !topIDs.has(review.id)) ||
    [];
  const friends = reviews?.friendReviews.nodes || [];
  const critics = data?.Review || [];
  const own = reviews?.userReview ? [reviews.userReview] : [];

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      sx={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}
    >
      {metadataID && (
        <Button
          variant="outlined"
          sx={{ alignSelf: "flex-start" }}
          disabled={loading || !reviews || confirmed === false}
          onClick={() => setEditing(true)}
        >
          {reviews?.userReview?.message ? "Edit your review" : "Write a review"}
        </Button>
      )}
      {confirmed === false && (
        <Alert severity="info">
          Writing reviews requires a verified Plex account.
        </Alert>
      )}
      {editing && metadataID && reviews && (
        <PlexReviewDialog
          key={`${metadataID}:${sessionRevision}`}
          metadataID={metadataID}
          review={reviews.userReview}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setReviews(
              (current) =>
                current && {
                  ...current,
                  userReview: saved,
                  topReviews: {
                    nodes: current.topReviews.nodes.map((review) =>
                      review.id === saved.id ? saved : review,
                    ),
                  },
                  recentReviews: {
                    nodes: current.recentReviews.nodes.map((review) =>
                      review.id === saved.id ? saved : review,
                    ),
                  },
                  friendReviews: {
                    nodes: current.friendReviews.nodes.map((review) =>
                      review.id === saved.id ? saved : review,
                    ),
                  },
                },
            );
            setEditing(false);
          }}
        />
      )}
      {warning && <Alert severity="warning">{warning}</Alert>}
      {critics.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: "bold", mb: 2 }}>
            Critic reviews
          </Typography>
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
      {loading ? (
        <Skeleton variant="rounded" height={160} />
      ) : (
        <>
          {!warning &&
            !critics.length &&
            !own.length &&
            !top.length &&
            !recent.length &&
            !friends.length && (
              <Typography color="text.secondary">
                No reviews available for this title yet.
              </Typography>
            )}
          <ReviewsSection title="Your review" reviews={own} />
          {reviews?.userReview?.status === "PENDING" && (
            <Typography color="text.secondary">
              Your review is awaiting moderation.
            </Typography>
          )}
          <ReviewsSection title="Recent reviews" reviews={recent} />
          <ReviewsSection title="Top reviews" reviews={top} />
          <ReviewsSection title="Friend reviews" reviews={friends} />
        </>
      )}
    </Box>
  );
}
