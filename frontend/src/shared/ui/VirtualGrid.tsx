import { Box } from "@mui/material";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface GridRange {
  start: number;
  end: number;
  visibleStart: number;
  visibleEnd: number;
}

interface VirtualGridProps {
  count: number | null;
  minimumCount?: number;
  itemWidth: number;
  imageAspectRatio: number;
  footerHeight?: number;
  resetKey?: string | null;
  observeRef?: React.RefObject<HTMLElement | null>;
  scrollElementRef?: React.RefObject<HTMLDivElement | null>;
  onRangeChange?: (range: GridRange) => void;
  itemKey?: (index: number) => React.Key;
  renderItem: (index: number, imageSizes: string) => React.ReactNode;
}

const GAP = 16;

/** A virtual card layout; callers own data, actions, loading and errors. */
export default function VirtualGrid({
  count,
  minimumCount = 0,
  itemWidth,
  imageAspectRatio,
  footerHeight = 68,
  resetKey,
  observeRef,
  scrollElementRef,
  onRangeChange,
  itemKey,
  renderItem,
}: VirtualGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ width: 0, top: 0 });
  const previousKey = useRef(resetKey);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let frame = 0;
    const update = () => {
      const bounds = grid.getBoundingClientRect();
      const scroll = scrollElementRef?.current;
      const next = {
        width: bounds.width,
        top: scroll
          ? bounds.top - scroll.getBoundingClientRect().top + scroll.scrollTop
          : bounds.top + window.scrollY,
      };
      setGeometry((current) =>
        current.width === next.width && current.top === next.top
          ? current
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(grid);
    if (observeRef?.current) observer.observe(observeRef.current);
    if (scrollElementRef?.current) observer.observe(scrollElementRef.current);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [observeRef, scrollElementRef]);

  const columns = Math.max(
    1,
    Math.floor((geometry.width + GAP) / (itemWidth + GAP)),
  );
  const cardWidth =
    geometry.width > 0
      ? Math.min(itemWidth, (geometry.width - GAP * (columns - 1)) / columns)
      : itemWidth;
  const rowHeight = Math.ceil(
    cardWidth / imageAspectRatio + footerHeight + GAP,
  );
  const displayCount = count ?? Math.max(minimumCount, columns * 6);
  const rowCount = Math.ceil(displayCount / columns);
  const options = {
    count: rowCount,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin: geometry.top,
    useFlushSync: false,
  };
  const windowGrid = useWindowVirtualizer({
    ...options,
    enabled: !scrollElementRef,
  });
  const containedGrid = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    ...options,
    enabled: Boolean(scrollElementRef),
    getScrollElement: () => scrollElementRef?.current ?? null,
  });
  const virtualizer = scrollElementRef ? containedGrid : windowGrid;
  const rows = virtualizer.getVirtualItems();
  const firstRow = rows[0]?.index ?? 0;
  const lastRow = rows[rows.length - 1]?.index ?? 0;
  const scrollOffset = virtualizer.scrollOffset ?? 0;

  useEffect(() => {
    virtualizer.measure();
  }, [columns, rowHeight, virtualizer]);
  useEffect(() => {
    if (resetKey && previousKey.current && previousKey.current !== resetKey) {
      if (scrollElementRef?.current) scrollElementRef.current.scrollTop = 0;
      else
        window.scrollTo({
          top: Math.max(0, geometry.top - 80),
          behavior: "smooth",
        });
    }
    previousKey.current = resetKey;
  }, [geometry.top, resetKey, scrollElementRef]);
  useEffect(() => {
    if (!onRangeChange || !displayCount) return;
    const relativeScroll = Math.max(0, scrollOffset - geometry.top);
    const viewportHeight =
      scrollElementRef?.current?.clientHeight ?? window.innerHeight;
    onRangeChange({
      start: firstRow * columns,
      end: Math.min(displayCount - 1, (lastRow + 1) * columns - 1),
      visibleStart: Math.floor(relativeScroll / rowHeight) * columns,
      visibleEnd: Math.min(
        displayCount - 1,
        (Math.ceil((relativeScroll + viewportHeight) / rowHeight) + 1) *
          columns -
          1,
      ),
    });
  }, [
    columns,
    displayCount,
    firstRow,
    geometry.top,
    lastRow,
    onRangeChange,
    rowHeight,
    scrollElementRef,
    scrollOffset,
  ]);

  return (
    <Box
      ref={gridRef}
      sx={{
        width: "100%",
        height: virtualizer.getTotalSize(),
        position: "relative",
      }}
    >
      {rows.map((row) => (
        <Box
          key={row.key}
          ref={virtualizer.measureElement}
          data-index={row.index}
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: rowHeight,
            transform: `translateY(${row.start - geometry.top}px)`,
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: `${GAP}px`,
            alignItems: "start",
          }}
        >
          {Array.from({ length: columns }, (_, column) => {
            const index = row.index * columns + column;
            return index >= displayCount ? (
              <Box key={column} />
            ) : (
              <Box
                key={itemKey?.(index) ?? index}
                sx={{
                  width: `min(100%, ${itemWidth}px)`,
                  justifySelf: "center",
                }}
              >
                {renderItem(index, `${Math.ceil(cardWidth)}px`)}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
