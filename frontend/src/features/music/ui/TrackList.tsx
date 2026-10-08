import { Alert, Box, Button, Skeleton, Typography } from "@mui/material";
import {
  useLibraryPages,
  useLibraryWindow,
  type LibraryQuery,
} from "features/library/model";
import VirtualGrid, { useVirtualGrid } from "shared/ui/VirtualGrid";
import { TrackRow } from "./TrackRow";

export function TrackList({
  query,
  album = false,
}: {
  query: LibraryQuery | null;
  album?: boolean;
}) {
  const collection = useLibraryWindow(query);
  const grid = useVirtualGrid({
    count: collection.totalSize,
    minimumCount: collection.knownSize + 1,
    itemWidth: 1_000_000,
    imageAspectRatio: Infinity,
    footerHeight: album ? 60 : 68,
    resetKey: collection.queryKey,
  });
  const range = useLibraryPages(collection, grid.range);
  const error = range.errors.get(0);
  if (error && !collection.first.data)
    return (
      <Alert
        severity="error"
        action={<Button onClick={() => range.retry(0)}>Retry</Button>}
      >
        {error.message}
      </Alert>
    );
  if (range.totalSize === 0)
    return (
      <Typography sx={{ py: 5 }} color="text.secondary">
        No tracks found.
      </Typography>
    );
  return (
    <Box role="list" aria-label={album ? "Album tracks" : "Tracks"}>
      <VirtualGrid
        grid={grid}
        itemKey={(index) => range.items.get(index)?.ratingKey ?? index}
        renderItem={(index) => {
          const item = range.items.get(index);
          return item ? (
            <TrackRow item={item} index={index} album={album} />
          ) : (
            <Skeleton variant="rounded" height={64} />
          );
        }}
      />
    </Box>
  );
}
