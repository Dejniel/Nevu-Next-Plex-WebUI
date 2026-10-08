import { hashKey } from "@tanstack/react-query";
import { libraryEntryKey } from "@nevu/contracts";
import { Box, Skeleton } from "@mui/material";
import React from "react";
import { CollectionViewport } from "shared/ui/CollectionViewport";
import { ActionableMediaCard } from "features/media-actions/public";
import { MusicMediaCard } from "features/music/public";
import { mediaCardAspectRatio } from "entities/media/model";
import { useLibraryViewport } from "../model/useLibraryViewport";
import {
  libraryResultQueryKey,
  type LibraryQuery,
} from "../model/libraryQuery";
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
  return (
    <LibraryCollectionGrid
      key={
        props.query ? hashKey(libraryResultQueryKey("", props.query)) : "empty"
      }
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
      key={
        props.query ? hashKey(libraryResultQueryKey("", props.query)) : "empty"
      }
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
  const { grid, range, hasData } = useLibraryViewport(query, {
    ...gridProps,
    loading,
    itemWidth: getLibraryCardWidth(layout, cardSize),
    imageAspectRatio: mediaCardAspectRatio(layout),
  });
  return (
    <CollectionViewport
      grid={grid}
      range={range}
      hasData={hasData}
      itemKey={libraryEntryKey}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      renderPlaceholder={() => <CardSkeleton layout={layout} />}
      renderItem={(item, _, imageSizes) => {
        if (item.type === "folder") return null;
        const Card = ["artist", "album"].includes(item.type)
          ? MusicMediaCard
          : ActionableMediaCard;
        return (
          <Card
            item={item}
            layout={layout}
            imageSizes={imageSizes}
            imageLoading="eager"
          />
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
