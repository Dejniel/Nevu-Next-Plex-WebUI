import type {
  LibraryCardDto,
  LibraryFilter,
  LibraryItemType,
  LibrarySort,
} from "@nevu/contracts";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ShuffleRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Skeleton,
  Tooltip,
} from "@mui/material";
import { motion } from "framer-motion";
import React, { useEffect, useLayoutEffect } from "react";
import { useParams } from "react-router-dom";
import MovieItem from "../../components/MovieItem";
import {
  getLibraryCardWidth,
  LibraryCardLayout,
  useLibraryCardView,
} from "../../components/LibraryCardViewControls";
import LibraryViewToolbar from "../../components/LibraryViewToolbar";
import { AuthStorage } from "../../auth/AuthStorage";
import { getLibrary } from "../../plex";
import {
  defaultLibrarySort,
  isRandomLibrarySort,
  librarySortOptions,
  normalizeLibrarySort,
} from "../../plex/librarySort";
import {
  getLibraryRandomSeed,
  replaceLibraryRandomSeed,
} from "../../plex/libraryRandom";
import {
  LIBRARY_RANGE_SIZE,
  libraryQueryKey,
  libraryRangeStore,
  LibraryQuery,
  useLibraryRange,
} from "../../states/LibraryRangeStore";

const GRID_GAP = 16;
const INITIAL_PLACEHOLDER_ROWS = 6;
const filters = new Set<LibraryFilter>([
  "all",
  "unwatched",
  "watched",
  "recentlyAdded",
  "onDeck",
  "newest",
]);

function storedFilter(): LibraryFilter {
  const value = localStorage.getItem("primaryFilter") as LibraryFilter | null;
  return value && filters.has(value) ? value : "all";
}

const viewGroupLabel = (viewGroup?: string) => {
  switch (viewGroup) {
    case "movie": return "Movies";
    case "show": return "Shows";
    case "episode": return "Episodes";
    default: return "All types";
  }
};

function useGridGeometry(
  gridRef: React.RefObject<HTMLDivElement | null>,
  toolbarRef: React.RefObject<HTMLDivElement | null>,
) {
  const [geometry, setGeometry] = React.useState({ width: 0, top: 0 });

  useLayoutEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      const next = { width: bounds.width, top: bounds.top + window.scrollY };
      setGeometry((current) =>
        current.width === next.width && current.top === next.top ? current : next,
      );
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(element);
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [gridRef, toolbarRef]);

  return geometry;
}

export default function BrowseLibrary({
  pageNavigation,
}: {
  pageNavigation: React.ReactNode;
}) {
  const { libraryID } = useParams<{ libraryID: string }>();
  return libraryID ? (
    <BrowseLibraryContent key={libraryID} libraryID={libraryID} pageNavigation={pageNavigation} />
  ) : null;
}

function BrowseLibraryContent({
  libraryID,
  pageNavigation,
}: {
  libraryID: string;
  pageNavigation: React.ReactNode;
}) {
  const [library, setLibrary] = React.useState<Plex.MediaContainer | null>(null);
  const [libraryError, setLibraryError] = React.useState<string | null>(null);
  const [libraryAttempt, setLibraryAttempt] = React.useState(0);
  const [primaryFilter, setPrimaryFilter] = React.useState<LibraryFilter>(storedFilter);
  const [typeFilter, setTypeFilter] = React.useState<LibraryItemType | "any">(
    () => (localStorage.getItem(`typeFilter:${libraryID}`) as LibraryItemType | "any") || "any",
  );
  const [sortBy, setSortBy] = React.useState<LibrarySort>(
    normalizeLibrarySort(localStorage.getItem("sortBy")),
  );
  const [seedRevision, setSeedRevision] = React.useState(0);
  const cardView = useLibraryCardView();
  const gridRef = React.useRef<HTMLDivElement>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const geometry = useGridGeometry(gridRef, toolbarRef);

  useEffect(() => {
    let current = true;
    setLibrary(null);
    setLibraryError(null);
    getLibrary(libraryID)
      .then((data) => {
        if (current) setLibrary(data);
      })
      .catch((error) => {
        if (current)
          setLibraryError(error instanceof Error ? error.message : "Unable to load the library");
      });
    return () => { current = false; };
  }, [libraryAttempt, libraryID]);

  const availableTypes = React.useMemo(
    () => new Set(
      library?.Type
        ?.map((entry) => entry.type)
        .filter((type): type is LibraryItemType =>
          type === "movie" || type === "show" || type === "episode") || [],
    ),
    [library],
  );

  const activeType = React.useMemo(() => {
    if (!library?.Type?.length) return undefined;
    const requestedType = primaryFilter === "all" && typeFilter !== "any"
      ? typeFilter
      : library.Type[0].type;
    return library.Type.find((entry) => entry.type === requestedType) || library.Type[0];
  }, [library, primaryFilter, typeFilter]);
  const sortOptions = React.useMemo(
    () => librarySortOptions(activeType?.Sort),
    [activeType],
  );
  const sortStorageKey = `librarySort:${libraryID}:${activeType?.type || "default"}`;
  const effectiveSort = sortOptions.some((option) => option.value === sortBy)
    ? sortBy
    : defaultLibrarySort(activeType?.Sort);

  useEffect(() => {
    if (!library) return;
    const stored = localStorage.getItem(sortStorageKey);
    const legacy = localStorage.getItem("sortBy");
    const next = [stored, legacy]
      .filter((value): value is string => Boolean(value))
      .map(normalizeLibrarySort)
      .find((candidate) => sortOptions.some((option) => option.value === candidate)) ||
      defaultLibrarySort(activeType?.Sort);
    setSortBy(next);
    localStorage.setItem(sortStorageKey, next);
  }, [activeType, library, sortOptions, sortStorageKey]);

  useEffect(() => {
    if (!library || typeFilter === "any" || availableTypes.has(typeFilter)) return;
    setTypeFilter("any");
    localStorage.setItem(`typeFilter:${libraryID}`, "any");
  }, [availableTypes, library, libraryID, typeFilter]);

  const baseQuery = React.useMemo<Omit<LibraryQuery, "sort" | "seed"> | null>(() => {
    if (!library || (typeFilter !== "any" && !availableTypes.has(typeFilter))) return null;
    const profile = AuthStorage.getActiveSession()?.profile;
    return {
      profileKey: profile ? String(profile.id) : "owner",
      sectionId: Number(libraryID),
      filter: primaryFilter,
      ...(primaryFilter === "all" && typeFilter !== "any" && { type: typeFilter }),
    };
  }, [availableTypes, library, libraryID, primaryFilter, typeFilter]);

  const query = React.useMemo<LibraryQuery | null>(() => {
    if (!baseQuery) return null;
    return {
      ...baseQuery,
      sort: effectiveSort,
      ...(isRandomLibrarySort(effectiveSort) && {
        seed: getLibraryRandomSeed(baseQuery.profileKey, baseQuery.sectionId),
      }),
    };
  }, [baseQuery, effectiveSort, seedRevision]);
  const queryKey = React.useMemo(() => query ? libraryQueryKey(query) : null, [query]);
  const range = useLibraryRange(queryKey);

  useEffect(() => {
    if (!query) return;
    const key = libraryRangeStore.ensure(query);
    return () => libraryRangeStore.release(key);
  }, [query]);

  const targetCardWidth = getLibraryCardWidth(cardView.layout, cardView.size);
  const columns = Math.max(
    1,
    Math.floor((geometry.width + GRID_GAP) / (targetCardWidth + GRID_GAP)),
  );
  const cardWidth = geometry.width > 0
    ? Math.min(targetCardWidth, (geometry.width - GRID_GAP * (columns - 1)) / columns)
    : targetCardWidth;
  const imageRatio = cardView.layout === "poster" ? 2 / 3 : 16 / 9;
  const rowHeight = Math.ceil(cardWidth / imageRatio + 68 + GRID_GAP);
  const displayCount = range.totalSize ?? Math.max(
    range.knownSize + (range.hasMore ? 1 : 0),
    columns * INITIAL_PLACEHOLDER_ROWS,
  );
  const rowCount = Math.ceil(displayCount / columns);
  const cardImageSizes = `${Math.ceil(cardWidth)}px`;

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin: geometry.top,
    useFlushSync: false,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const firstVirtualRow = virtualRows[0]?.index ?? 0;
  const lastVirtualRow = virtualRows[virtualRows.length - 1]?.index ?? 0;

  useEffect(() => {
    virtualizer.measure();
  }, [columns, rowHeight, virtualizer]);

  useEffect(() => {
    if (!queryKey || rowCount === 0) return;
    const relativeScroll = Math.max(0, (virtualizer.scrollOffset || window.scrollY) - geometry.top);
    const firstVisibleRow = Math.max(0, Math.floor(relativeScroll / rowHeight));
    const lastVisibleRow = Math.min(
      rowCount - 1,
      Math.ceil((relativeScroll + window.innerHeight) / rowHeight),
    );
    libraryRangeStore.demand(
      queryKey,
      firstVirtualRow * columns,
      Math.min(displayCount - 1, (lastVirtualRow + 1) * columns - 1),
      firstVisibleRow * columns,
      Math.min(displayCount - 1, (lastVisibleRow + 1) * columns - 1),
    );
  }, [
    columns,
    displayCount,
    firstVirtualRow,
    geometry.top,
    lastVirtualRow,
    queryKey,
    rowCount,
    rowHeight,
    virtualizer.scrollOffset,
  ]);

  const initialRangeError = range.errors.get(0);
  const itemCount = range.totalSize?.toLocaleString();

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        width: "100%",
        minHeight: "calc(100vh - 64px)",
        mt: "64px",
      }}
    >
      <Box ref={toolbarRef} sx={{ width: "100%" }}>
        <LibraryViewToolbar
          cardView={cardView}
          showLeadingOnMobile
          leading={
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: { xs: "space-evenly", lg: "flex-start" },
              flexWrap: { xs: "wrap", lg: "nowrap" },
              gap: 1,
              "& > .MuiInputBase-root": {
                flex: { xs: "1 1 105px", lg: "0 0 auto" },
                minWidth: 0,
              },
            }}
          >
            <Select
              value={primaryFilter}
              onChange={(event) => {
                const value = event.target.value as LibraryFilter;
                setPrimaryFilter(value);
                localStorage.setItem("primaryFilter", value);
              }}
              size="small"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="unwatched">Unwatched</MenuItem>
              <MenuItem value="watched">Watched</MenuItem>
              <Divider />
              <MenuItem value="recentlyAdded">Recently Added</MenuItem>
              <MenuItem value="onDeck">On Deck</MenuItem>
              <MenuItem value="newest">Newest</MenuItem>
            </Select>

            {primaryFilter === "all" && (
              <Select
                value={typeFilter}
                onChange={(event) => {
                  const value = event.target.value as LibraryItemType | "any";
                  setTypeFilter(value);
                  localStorage.setItem(`typeFilter:${libraryID}`, value);
                }}
                size="small"
              >
                <MenuItem value="any">
                  {viewGroupLabel(range.viewGroup || library?.viewGroup)}
                </MenuItem>
                <Divider />
                {library?.Type?.filter((entry) => availableTypes.has(entry.type as LibraryItemType))
                  .map((type) => (
                    <MenuItem key={type.key} value={type.type}>{type.title}</MenuItem>
                  ))}
              </Select>
            )}

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
              <Select
                value={effectiveSort}
                onChange={(event) => {
                  const value = event.target.value as LibrarySort;
                  setSortBy(value);
                  localStorage.setItem(sortStorageKey, value);
                }}
                size="small"
                sx={{ minWidth: 0 }}
              >
                {sortOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </Select>
              {isRandomLibrarySort(effectiveSort) && baseQuery && (
                <Tooltip title="Reshuffle">
                  <IconButton
                    size="small"
                    aria-label="Reshuffle library"
                    onClick={() => {
                      if (queryKey) libraryRangeStore.drop(queryKey);
                      replaceLibraryRandomSeed(baseQuery.profileKey, baseQuery.sectionId);
                      setSeedRevision((value) => value + 1);
                      window.scrollTo({ top: Math.max(0, geometry.top - 80), behavior: "smooth" });
                    }}
                  >
                    <ShuffleRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Box
                component="span"
                sx={{
                  minWidth: 36,
                  color: "text.secondary",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {itemCount ?? <Skeleton width={32} />}
              </Box>
            </Box>
          </Box>
          }
          pageNavigation={pageNavigation}
        />
      </Box>

      <Box sx={{ width: "100%", px: { xs: 1, md: 6 }, pb: 2 }}>
        <Box ref={gridRef} sx={{ width: "100%", mt: 2 }}>
          {libraryError ? (
            <Alert
              severity="error"
              action={<Button color="inherit" onClick={() => setLibraryAttempt((value) => value + 1)}>Retry</Button>}
            >
              {libraryError}
            </Alert>
          ) : initialRangeError && range.items.size === 0 && queryKey ? (
            <Alert
              severity="error"
              action={initialRangeError.retryable ? (
                <Button color="inherit" onClick={() => libraryRangeStore.retry(queryKey, 0)}>Retry</Button>
              ) : undefined}
            >
              {initialRangeError.message}
            </Alert>
          ) : (
            <Box
              sx={{
                height: virtualizer.getTotalSize(),
                minHeight: library ? 0 : rowHeight * 2,
                position: "relative",
                width: "100%",
              }}
            >
              {virtualRows.map((virtualRow) => (
                <Box
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: rowHeight,
                    transform: `translateY(${virtualRow.start - geometry.top}px)`,
                    display: "grid",
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: `${GRID_GAP}px`,
                    alignItems: "start",
                  }}
                >
                  {Array.from({ length: columns }, (_, column) => {
                    const itemIndex = virtualRow.index * columns + column;
                    if (itemIndex >= displayCount) return <Box key={column} />;
                    const item = range.items.get(itemIndex);
                    const offset = Math.floor(itemIndex / LIBRARY_RANGE_SIZE) * LIBRARY_RANGE_SIZE;
                    const error = range.errors.get(offset);
                    return (
                      <Box
                        key={item?.ratingKey || itemIndex}
                        sx={{ width: `min(100%, ${targetCardWidth}px)`, justifySelf: "center" }}
                      >
                        {item ? (
                          <MovieItem
                            item={item}
                            layout={cardView.layout}
                            imageSizes={cardImageSizes}
                            imageLoading="eager"
                          />
                        ) : error && queryKey ? (
                          <RangeErrorCard
                            layout={cardView.layout}
                            onRetry={error.retryable
                              ? () => libraryRangeStore.retry(queryKey, offset)
                              : undefined}
                          />
                        ) : (
                          <CardSkeleton layout={cardView.layout} />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
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
        <Button size="small" onClick={onRetry}>Retry</Button>
      ) : (
        <Box sx={{ color: "text.secondary", fontSize: "0.75rem" }}>Unavailable</Box>
      )}
    </Box>
  );
}
