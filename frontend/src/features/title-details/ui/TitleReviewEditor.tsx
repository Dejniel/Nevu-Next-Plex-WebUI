import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useActiveServerScope, useAuthSession } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { AppDialog } from "shared/ui";
import type { PlexReviews } from "../api/plexCommunity";
import {
  getReviewMetadataID,
  titleReviewsQueryOptions,
} from "../model/titleReviewsQuery";
import PlexReviewDialog from "./PlexReviewDialog";

export default function TitleReviewEditor({
  item,
  onClose,
}: {
  item: Plex.Metadata;
  onClose: () => void;
}) {
  const { profileKey } = useActiveServerScope();
  const revision = useAuthSession((state) => state.revision);
  const confirmed = useAuthSession((state) => state.activeUser?.confirmed);
  const options = titleReviewsQueryOptions(profileKey, item.guid);
  const reviews = useQuery(options, serverQueryClient);

  if (!reviews.data || confirmed === false)
    return (
      <AppDialog open title="Write your own review" onClose={onClose}>
        {confirmed === false ? (
          <Alert severity="info">
            Writing reviews requires a verified Plex account.
          </Alert>
        ) : reviews.isError ? (
          <Alert
            severity="warning"
            action={<Button onClick={() => void reviews.refetch()}>Retry</Button>}
          >
            Plex community reviews are temporarily unavailable.
          </Alert>
        ) : (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress aria-label="Loading your review" />
          </Box>
        )}
      </AppDialog>
    );

  return (
    <PlexReviewDialog
      key={`${item.guid}:${revision}`}
      metadataID={getReviewMetadataID(item.guid)!}
      review={reviews.data.userReview}
      onClose={onClose}
      onSaved={(saved) => {
        if (useAuthSession.getState().revision !== revision) return;
        void serverQueryClient.cancelQueries({
          queryKey: options.queryKey,
          exact: true,
        });
        serverQueryClient.setQueryData<PlexReviews>(options.queryKey, (current) =>
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
        onClose();
      }}
    />
  );
}
