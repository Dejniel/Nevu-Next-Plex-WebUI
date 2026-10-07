import { hashKey } from "@tanstack/react-query";
import { Alert, Box, Button, Skeleton } from "@mui/material";
import React from "react";
import VirtualGrid, { useVirtualGrid } from "shared/ui/VirtualGrid";
import { ActionableMediaCard } from "features/media-actions/public";
import { mediaCardAspectRatio } from "entities/media/model";
import { useLibraryPages, useLibraryWindow } from "../model/useLibraryPages";
import { LIBRARY_RANGE_SIZE, libraryResultQueryKey, type LibraryQuery } from "../model/libraryQuery";
import { getLibraryCardWidth, LibraryCardLayout } from "./LibraryCardViewControls";

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
  return (
    <LibraryCollectionGrid
      key={props.query ? hashKey(libraryResultQueryKey("", props.query)) : "empty"}
      {...props}
    />
  );
}

export function ContainedLibraryCollectionGrid(
  props: LibraryCollectionGridProps & {
    scrollElementRef: React.RefObject<HTMLDivElement | null>;
  },
) {
  return (
    <LibraryCollectionGrid
      key={props.query ? hashKey(libraryResultQueryKey("", props.query)) : "empty"}
      {...props}
    />
  );
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
  const collection = useLibraryWindow(query);
  const grid = useVirtualGrid({
    ...gridProps,
    count: query ? collection.totalSize : loading ? null : 0,
    minimumCount: collection.knownSize + (collection.totalSize === null ? 1 : 0),
    itemWidth: getLibraryCardWidth(layout, cardSize),
    imageAspectRatio: mediaCardAspectRatio(layout),
    resetKey: collection.queryKey,
  });
  const range = useLibraryPages(collection, grid.range);
  const { queryKey } = range;
  const initialError = range.errors.get(0);
  if (initialError && !collection.first.data && queryKey)
    return (
      <Alert
        severity="error"
        action={
          initialError.retryable ? (
            <Button color="inherit" onClick={() => range.retry(0)}>
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

  return (
    <>
      {initialError && collection.first.data && queryKey && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={() => range.retry(0)}>
              Retry
            </Button>
          }
        >
          {initialError.message}
        </Alert>
      )}
      <VirtualGrid
        grid={grid}
        itemKey={(index) => range.items.get(index)?.ratingKey ?? index}
        renderItem={(index, imageSizes) => {
          const item = range.items.get(index);
          const offset = Math.floor(index / LIBRARY_RANGE_SIZE) * LIBRARY_RANGE_SIZE;
          const error = range.errors.get(offset);
          return item ? (
            <ActionableMediaCard
              item={item}
              layout={layout}
              imageSizes={imageSizes}
              imageLoading="eager"
            />
          ) : error && queryKey ? (
            <RangeErrorCard
              layout={layout}
              onRetry={error.retryable ? () => range.retry(offset) : undefined}
            />
          ) : (
            <CardSkeleton layout={layout} />
          );
        }}
      />
    </>
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
          aspectRatio: mediaCardAspectRatio(layout),
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
        aspectRatio: mediaCardAspectRatio(layout),
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
