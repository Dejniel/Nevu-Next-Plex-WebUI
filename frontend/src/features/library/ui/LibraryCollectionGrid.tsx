import { Alert, Box, Button, Skeleton } from "@mui/material";
import {
  useVirtualizer,
  useWindowVirtualizer,
  VirtualItem,
} from "@tanstack/react-virtual";
import React, { useEffect, useLayoutEffect } from "react";
import {
  LIBRARY_RANGE_SIZE,
  libraryRangeStore,
  LibraryQuery,
  LibraryRangeSnapshot,
  useLibraryQueryRange,
} from "../model/LibraryRangeStore";
import MovieItem from "components/MovieItem";
import {
  getLibraryCardWidth,
  LibraryCardLayout,
} from "./LibraryCardViewControls";

const GRID_GAP = 16;
const INITIAL_PLACEHOLDER_ROWS = 6;

interface LibraryCollectionGridProps {
  query: LibraryQuery | null;
  layout: LibraryCardLayout;
  cardSize: number;
  loading?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
}

interface WindowLibraryCollectionGridProps extends LibraryCollectionGridProps {
  observeRef?: React.RefObject<HTMLElement | null>;
}

interface ContainedLibraryCollectionGridProps extends LibraryCollectionGridProps {
  scrollElementRef: React.RefObject<HTMLDivElement | null>;
}

interface GridGeometry {
  width: number;
  top: number;
}

interface GridModel {
  columns: number;
  displayCount: number;
  queryKey: string | null;
  range: LibraryRangeSnapshot;
  rowCount: number;
  rowHeight: number;
  targetCardWidth: number;
  cardImageSizes: string;
  refreshAfterMutation?: () => void;
}

function useGridGeometry(
  gridRef: React.RefObject<HTMLDivElement | null>,
  observeRef?: React.RefObject<HTMLElement | null>,
  scrollElementRef?: React.RefObject<HTMLDivElement | null>,
) {
  const [geometry, setGeometry] = React.useState<GridGeometry>({ width: 0, top: 0 });

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let frame = 0;
    const update = () => {
      const bounds = grid.getBoundingClientRect();
      const scrollElement = scrollElementRef?.current;
      const top = scrollElement
        ? bounds.top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop
        : bounds.top + window.scrollY;
      const next = { width: bounds.width, top };
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
    observer.observe(grid);
    if (observeRef?.current) observer.observe(observeRef.current);
    if (scrollElementRef?.current) observer.observe(scrollElementRef.current);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [gridRef, observeRef, scrollElementRef]);

  return geometry;
}

function useGridModel(
  query: LibraryQuery | null,
  width: number,
  layout: LibraryCardLayout,
  cardSize: number,
  loading: boolean,
): GridModel {
  const { queryKey, range } = useLibraryQueryRange(query);

  const targetCardWidth = getLibraryCardWidth(layout, cardSize);
  const columns = Math.max(
    1,
    Math.floor((width + GRID_GAP) / (targetCardWidth + GRID_GAP)),
  );
  const cardWidth = width > 0
    ? Math.min(targetCardWidth, (width - GRID_GAP * (columns - 1)) / columns)
    : targetCardWidth;
  const imageRatio = layout === "poster" ? 2 / 3 : 16 / 9;
  const rowHeight = Math.ceil(cardWidth / imageRatio + 68 + GRID_GAP);
  const displayCount = query
    ? range.totalSize ?? Math.max(
      range.knownSize + (range.hasMore ? 1 : 0),
      columns * INITIAL_PLACEHOLDER_ROWS,
    )
    : loading ? columns * INITIAL_PLACEHOLDER_ROWS : 0;

  return {
    columns,
    displayCount,
    queryKey,
    range,
    rowCount: Math.ceil(displayCount / columns),
    rowHeight,
    targetCardWidth,
    cardImageSizes: `${Math.ceil(cardWidth)}px`,
    ...(query?.source === "onDeck" && queryKey && {
      refreshAfterMutation: () => libraryRangeStore.invalidateQuery(queryKey),
    }),
  };
}

function useRangeDemand({
  model,
  virtualRows,
  scrollOffset,
  viewportHeight,
  scrollMargin,
}: {
  model: GridModel;
  virtualRows: VirtualItem[];
  scrollOffset: number;
  viewportHeight: number;
  scrollMargin: number;
}) {
  const firstVirtualRow = virtualRows[0]?.index ?? 0;
  const lastVirtualRow = virtualRows[virtualRows.length - 1]?.index ?? 0;

  useEffect(() => {
    if (!model.queryKey || model.rowCount === 0) return;
    const relativeScroll = Math.max(0, scrollOffset - scrollMargin);
    const firstVisibleRow = Math.max(0, Math.floor(relativeScroll / model.rowHeight));
    const lastVisibleRow = Math.min(
      model.rowCount - 1,
      Math.ceil((relativeScroll + viewportHeight) / model.rowHeight),
    );
    libraryRangeStore.demand(
      model.queryKey,
      firstVirtualRow * model.columns,
      Math.min(model.displayCount - 1, (lastVirtualRow + 1) * model.columns - 1),
      firstVisibleRow * model.columns,
      Math.min(model.displayCount - 1, (lastVisibleRow + 1) * model.columns - 1),
    );
  }, [
    firstVirtualRow,
    lastVirtualRow,
    model.columns,
    model.displayCount,
    model.queryKey,
    model.rowCount,
    model.rowHeight,
    scrollMargin,
    scrollOffset,
    viewportHeight,
  ]);
}

export function WindowLibraryCollectionGrid({
  observeRef,
  ...props
}: WindowLibraryCollectionGridProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const geometry = useGridGeometry(gridRef, observeRef);
  const model = useGridModel(
    props.query,
    geometry.width,
    props.layout,
    props.cardSize,
    Boolean(props.loading),
  );
  const previousQueryKeyRef = React.useRef<string | null>(null);
  const virtualizer = useWindowVirtualizer({
    count: model.rowCount,
    estimateSize: () => model.rowHeight,
    overscan: 3,
    scrollMargin: geometry.top,
    useFlushSync: false,
  });
  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    virtualizer.measure();
  }, [model.columns, model.rowHeight, virtualizer]);

  useEffect(() => {
    if (
      model.queryKey &&
      previousQueryKeyRef.current &&
      previousQueryKeyRef.current !== model.queryKey
    ) window.scrollTo({ top: Math.max(0, geometry.top - 80), behavior: "smooth" });
    previousQueryKeyRef.current = model.queryKey;
  }, [geometry.top, model.queryKey]);

  useRangeDemand({
    model,
    virtualRows,
    scrollOffset: virtualizer.scrollOffset || window.scrollY,
    viewportHeight: window.innerHeight,
    scrollMargin: geometry.top,
  });

  return (
    <Box ref={gridRef} sx={{ width: "100%" }}>
      <LibraryGridBody
        {...props}
        model={model}
        virtualRows={virtualRows}
        totalHeight={virtualizer.getTotalSize()}
        translateOffset={geometry.top}
        measureElement={virtualizer.measureElement}
      />
    </Box>
  );
}

export function ContainedLibraryCollectionGrid({
  scrollElementRef,
  ...props
}: ContainedLibraryCollectionGridProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const geometry = useGridGeometry(gridRef, undefined, scrollElementRef);
  const model = useGridModel(
    props.query,
    geometry.width,
    props.layout,
    props.cardSize,
    Boolean(props.loading),
  );
  const previousQueryKeyRef = React.useRef<string | null>(null);
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: model.rowCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => model.rowHeight,
    overscan: 3,
    scrollMargin: geometry.top,
    useFlushSync: false,
  });
  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    virtualizer.measure();
  }, [model.columns, model.rowHeight, virtualizer]);

  useEffect(() => {
    if (
      model.queryKey &&
      previousQueryKeyRef.current &&
      previousQueryKeyRef.current !== model.queryKey &&
      scrollElementRef.current
    ) scrollElementRef.current.scrollTop = 0;
    previousQueryKeyRef.current = model.queryKey;
  }, [model.queryKey, scrollElementRef]);

  useRangeDemand({
    model,
    virtualRows,
    scrollOffset: virtualizer.scrollOffset || scrollElementRef.current?.scrollTop || 0,
    viewportHeight: scrollElementRef.current?.clientHeight || window.innerHeight,
    scrollMargin: geometry.top,
  });

  return (
    <Box ref={gridRef} sx={{ width: "100%" }}>
      <LibraryGridBody
        {...props}
        model={model}
        virtualRows={virtualRows}
        totalHeight={virtualizer.getTotalSize()}
        translateOffset={geometry.top}
        measureElement={virtualizer.measureElement}
      />
    </Box>
  );
}

function LibraryGridBody({
  model,
  virtualRows,
  totalHeight,
  translateOffset,
  measureElement,
  layout,
  loading,
  emptyMessage = "This collection is empty.",
  emptyAction,
}: LibraryCollectionGridProps & {
  model: GridModel;
  virtualRows: VirtualItem[];
  totalHeight: number;
  translateOffset: number;
  measureElement: (element: HTMLDivElement | null) => void;
}) {
  const initialRangeError = model.range.errors.get(0);

  if (initialRangeError && model.range.items.size === 0 && model.queryKey) {
    return (
      <Alert
        severity="error"
        action={initialRangeError.retryable ? (
          <Button color="inherit" onClick={() => libraryRangeStore.retry(model.queryKey as string, 0)}>
            Retry
          </Button>
        ) : undefined}
      >
        {initialRangeError.message}
      </Alert>
    );
  }

  if (model.range.totalSize === 0) {
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
        <Box>{emptyMessage}</Box>
        {emptyAction}
      </Box>
    );
  }

  if (!model.rowCount && !loading) return null;

  return (
    <Box
      sx={{
        height: totalHeight,
        minHeight: loading ? model.rowHeight * 2 : 0,
        position: "relative",
        width: "100%",
      }}
    >
      {virtualRows.map((virtualRow) => (
        <Box
          key={virtualRow.key}
          ref={measureElement}
          data-index={virtualRow.index}
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: model.rowHeight,
            transform: `translateY(${virtualRow.start - translateOffset}px)`,
            display: "grid",
            gridTemplateColumns: `repeat(${model.columns}, minmax(0, 1fr))`,
            gap: `${GRID_GAP}px`,
            alignItems: "start",
          }}
        >
          {Array.from({ length: model.columns }, (_, column) => {
            const itemIndex = virtualRow.index * model.columns + column;
            if (itemIndex >= model.displayCount) return <Box key={column} />;
            const item = model.range.items.get(itemIndex);
            const offset = Math.floor(itemIndex / LIBRARY_RANGE_SIZE) * LIBRARY_RANGE_SIZE;
            const error = model.range.errors.get(offset);
            return (
              <Box
                key={item?.ratingKey || itemIndex}
                sx={{ width: `min(100%, ${model.targetCardWidth}px)`, justifySelf: "center" }}
              >
                {item ? (
                  <MovieItem
                    item={item}
                    layout={layout}
                    imageSizes={model.cardImageSizes}
                    imageLoading="eager"
                    refetchData={model.refreshAfterMutation}
                  />
                ) : error && model.queryKey ? (
                  <RangeErrorCard
                    layout={layout}
                    onRetry={error.retryable
                      ? () => libraryRangeStore.retry(model.queryKey as string, offset)
                      : undefined}
                  />
                ) : (
                  <CardSkeleton layout={layout} />
                )}
              </Box>
            );
          })}
        </Box>
      ))}
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
