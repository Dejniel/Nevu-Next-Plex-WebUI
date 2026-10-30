import type { MediaMetadata } from "entities/media/model";
import { Alert, Box, Button } from "@mui/material";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveServerScope } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { libraryDirectoryQueryOptions } from "../model/libraryDirectories";
import { type To, useLocation } from "react-router-dom";
import { shuffleArray } from "shared/lib/arrays";
import { MediaShelf, type MediaShelfProps } from "features/media-actions/public";
import type { LibraryCardLayout } from "./LibraryCardViewControls";
import { useLibraryPages, useLibraryWindow } from "../model/useLibraryPages";
import type { LibraryQuery } from "../model/libraryQuery";
import { libraryBrowseTo } from "shared/lib/navigation";

const SHELF_LIMIT = 40;
type ShelfPresentation = Omit<MediaShelfProps, "data" | "loading">;

/** Library sources own reads; MediaShelf owns their shared presentation. */
export default function MovieItemSlider({
  title,
  dir,
  link,
  shuffle,
  data,
  plexTvSource,
  layout = "landscape",
  cardSize,
  query,
  browseTo,
}: {
  title: string;
  dir?: string;
  link?: string;
  shuffle?: boolean;
  data?: MediaMetadata[];
  plexTvSource?: boolean;
  layout?: LibraryCardLayout;
  cardSize?: number;
  query?: LibraryQuery;
  browseTo?: To;
}) {
  const location = useLocation();
  const presentation: ShelfPresentation = {
    title,
    layout,
    cardSize,
    plexTvSource,
    browseTo: browseTo ?? (link ? libraryBrowseTo(location, link) : null),
  };
  if (query) return <QueryShelf query={query} presentation={presentation} />;
  if (data !== undefined)
    return <MediaShelf {...presentation} data={data.slice(0, SHELF_LIMIT)} />;
  if (dir)
    return (
      <DirectoryShelf dir={dir} shuffle={shuffle} presentation={presentation} />
    );
  return null;
}

function DirectoryShelf({
  dir,
  shuffle,
  presentation,
}: {
  dir: string;
  shuffle?: boolean;
  presentation: ShelfPresentation;
}) {
  const scope = useActiveServerScope();
  const directory = useQuery(
    {
      ...libraryDirectoryQueryOptions(scope, dir),
      enabled: Boolean(scope.serverId && scope.profileKey),
    },
    serverQueryClient,
  );
  const items = useMemo(() => {
    if (!directory.data) return [];
    const metadata = directory.data.Metadata ?? [];
    return (shuffle ? shuffleArray(metadata) : metadata).slice(0, SHELF_LIMIT);
  }, [directory.data, shuffle]);
  if (!directory.data && directory.error)
    return (
      <ShelfError
        title={presentation.title}
        onRetry={() => void directory.refetch()}
      />
    );
  return (
    <MediaShelf
      key={`${scope.serverId}:${scope.profileKey}:${dir}`}
      {...presentation}
      data={items}
      loading={!directory.data}
    />
  );
}

function QueryShelf({
  query,
  presentation,
}: {
  query: LibraryQuery;
  presentation: ShelfPresentation;
}) {
  const range = useLibraryPages(useLibraryWindow(query), {
    start: 0,
    end: SHELF_LIMIT - 1,
    visibleStart: 0,
    visibleEnd: SHELF_LIMIT - 1,
  });
  const pending = range.totalSize === null && range.items.size === 0;
  const error = range.errors.get(0);
  if (pending && error)
    return (
      <ShelfError
        title={presentation.title}
        onRetry={error.retryable ? () => range.retry(0) : undefined}
      />
    );
  const count = Math.min(SHELF_LIMIT, range.totalSize ?? range.knownSize);
  const items = Array.from({ length: count }).flatMap((_, index) => {
    const item = range.items.get(index);
    return item && item.type !== "folder" ? [item] : [];
  });
  return (
    <MediaShelf
      key={range.queryKey}
      {...presentation}
      data={items}
      loading={pending}
    />
  );
}

function ShelfError({
  title,
  onRetry,
}: {
  title: string;
  onRetry?: () => unknown;
}) {
  return (
    <Box sx={{ width: "100%", px: "2.5vw" }}>
      <Alert
        severity="error"
        action={
          onRetry ? (
            <Button color="inherit" onClick={() => void onRetry()}>
              Retry
            </Button>
          ) : undefined
        }
      >
        Unable to load {title.toLocaleLowerCase()}.
      </Alert>
    </Box>
  );
}
