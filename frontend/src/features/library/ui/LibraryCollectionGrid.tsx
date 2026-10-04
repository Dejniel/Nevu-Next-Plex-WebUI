import { Alert, Box, Button, Skeleton } from "@mui/material";
import React, { useCallback, useEffect } from "react";
import VirtualGrid, { type GridRange } from "shared/ui/VirtualGrid";
import { ActionableMediaCard } from "features/media-actions/public";
import {
  LIBRARY_RANGE_SIZE,
  libraryRangeStore,
  LibraryQuery,
  useLibraryQueryRange,
} from "../model/LibraryRangeStore";
import {
  getLibraryCardWidth,
  LibraryCardLayout,
} from "./LibraryCardViewControls";

interface LibraryCollectionGridProps {
  query: LibraryQuery | null;
  layout: LibraryCardLayout;
  cardSize: number;
  loading?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  observeRef?: React.RefObject<HTMLElement | null>;
  scrollElementRef?: React.RefObject<HTMLDivElement | null>;
}

export function WindowLibraryCollectionGrid(props: LibraryCollectionGridProps) {
  return <LibraryCollectionGrid {...props} />;
}

export function ContainedLibraryCollectionGrid(
  props: LibraryCollectionGridProps & {
    scrollElementRef: React.RefObject<HTMLDivElement | null>;
  },
) {
  return <LibraryCollectionGrid {...props} />;
}

function LibraryCollectionGrid({
  query,
  layout,
  cardSize,
  loading,
  emptyMessage = "This collection is empty.",
  emptyAction,
  ...gridProps
}: LibraryCollectionGridProps) {
  const { queryKey, range } = useLibraryQueryRange(query);
  useEffect(() => {
    // Registering the query precedes its first request; the grid's child effect may run earlier.
    if (queryKey) libraryRangeStore.demand(queryKey, 0, 0);
  }, [queryKey]);
  const demand = useCallback(
    (visible: GridRange) => {
      if (queryKey)
        libraryRangeStore.demand(
          queryKey,
          visible.start,
          visible.end,
          visible.visibleStart,
          visible.visibleEnd,
        );
    },
    [queryKey],
  );
  const initialError = range.errors.get(0);
  if (initialError && !range.items.size && queryKey)
    return (
      <Alert
        severity="error"
        action={
          initialError.retryable ? (
            <Button
              color="inherit"
              onClick={() => libraryRangeStore.retry(queryKey, 0)}
            >
              Retry
            </Button>
          ) : undefined
        }
      >
        {initialError.message}
      </Alert>
    );
  if (query && range.totalSize === 0)
    return (
      <Box
        sx={{
          minHeight: 180,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          color: "text.secondary",
        }}
      >
        {emptyMessage}
        {emptyAction}
      </Box>
    );
  const refreshAfterMutation =
    query?.source === "onDeck" && queryKey
      ? () => libraryRangeStore.invalidateQuery(queryKey)
      : undefined;

  return (
    <VirtualGrid
      {...gridProps}
      count={query ? range.totalSize : loading ? null : 0}
      minimumCount={range.knownSize + (range.hasMore ? 1 : 0)}
      itemWidth={getLibraryCardWidth(layout, cardSize)}
      imageAspectRatio={layout === "poster" ? 2 / 3 : 16 / 9}
      resetKey={queryKey}
      onRangeChange={query ? demand : undefined}
      itemKey={(index) => range.items.get(index)?.ratingKey ?? index}
      renderItem={(index, imageSizes) => {
        const item = range.items.get(index);
        const offset =
          Math.floor(index / LIBRARY_RANGE_SIZE) * LIBRARY_RANGE_SIZE;
        const error = range.errors.get(offset);
        return item ? (
          <ActionableMediaCard
            item={item}
            layout={layout}
            imageSizes={imageSizes}
            imageLoading="eager"
            refetchData={refreshAfterMutation}
          />
        ) : error && queryKey ? (
          <RangeErrorCard
            layout={layout}
            onRetry={
              error.retryable
                ? () => libraryRangeStore.retry(queryKey, offset)
                : undefined
            }
          />
        ) : (
          <CardSkeleton layout={layout} />
        );
      }}
    />
  );
}

function CardSkeleton({ layout }: { layout: LibraryCardLayout }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: "100%",
        overflow: "hidden",
        backgroundColor: "rgba(18, 18, 22, 0.7)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <Box
        sx={{
          width: "100%",
          aspectRatio: layout === "poster" ? "2/3" : "16/9",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#17191e",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 -32px 56px rgba(0,0,0,0.24)",
        }}
      >
        <Skeleton
          animation="pulse"
          variant="rectangular"
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(255,255,255,0.055)",
          }}
        />
      </Box>
      <Box
        sx={{
          minHeight: 60,
          px: "11px",
          pt: "9px",
          pb: "10px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: "6px",
        }}
      >
        <Skeleton
          animation="pulse"
          variant="rounded"
          width="72%"
          height={14}
          sx={{ backgroundColor: "rgba(255,255,255,0.11)" }}
        />
        <Skeleton
          animation="pulse"
          variant="rounded"
          width="46%"
          height={9}
          sx={{ backgroundColor: "rgba(255,255,255,0.065)" }}
        />
      </Box>
    </Box>
  );
}

function RangeErrorCard({
  layout,
  onRetry,
}: {
  layout: LibraryCardLayout;
  onRetry?: () => void;
}) {
  return (
    <Box
      sx={{
        aspectRatio: layout === "poster" ? "2/3" : "16/9",
        minHeight: 90,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {onRetry ? (
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      ) : (
        <Box sx={{ color: "text.secondary", fontSize: "0.75rem" }}>
          Unavailable
        </Box>
      )}
    </Box>
  );
}
