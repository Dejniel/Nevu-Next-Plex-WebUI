import { Box } from "@mui/material";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import React, { useEffect, useLayoutEffect, useState } from "react";

export interface GridRange {
  start: number;
  end: number;
  visibleStart: number;
  visibleEnd: number;
}

interface VirtualGridOptions {
  count: number | null;
  minimumCount?: number;
  itemWidth: number;
  imageAspectRatio: number;
  footerHeight?: number;
  resetKey?: string | null;
  observeRef?: React.RefObject<HTMLElement | null>;
  scrollElementRef?: React.RefObject<HTMLDivElement | null>;
}

const GAP = 16;

/** Compute the current range before the caller reads its pages. */
export function useVirtualGrid({
  count,
  minimumCount = 0,
  itemWidth,
  imageAspectRatio,
  footerHeight = 68,
  resetKey,
  observeRef,
  scrollElementRef,
}: VirtualGridOptions) {
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = useState({ width: 0, top: 0 });
  const [activeKey, setActiveKey] = useState<string | null | undefined>(resetKey);
  const positioned = !resetKey || activeKey === resetKey;

  useLayoutEffect(() => {
    const grid = gridElement;
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
  }, [gridElement, observeRef, scrollElementRef]);

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
    enabled: Boolean(gridElement) && positioned && !scrollElementRef,
  });
  const containedGrid = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    ...options,
    enabled: Boolean(gridElement && scrollElementRef) && positioned,
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
  useLayoutEffect(() => {
    if (!gridElement) return;
    if (resetKey && activeKey !== resetKey) {
      if (scrollElementRef?.current) scrollElementRef.current.scrollTop = 0;
      else
        window.scrollTo({
          top: Math.max(0, geometry.top - 80),
          behavior: "instant",
        });
    }
    setActiveKey(resetKey);
  }, [activeKey, geometry.top, gridElement, resetKey, scrollElementRef]);
  const relativeScroll = Math.max(0, scrollOffset - geometry.top);
  const viewportHeight = scrollElementRef?.current?.clientHeight ?? window.innerHeight;
  const range: GridRange = {
    start: firstRow * columns,
    end: Math.max(0, Math.min(displayCount - 1, (lastRow + 1) * columns - 1)),
    visibleStart: Math.floor(relativeScroll / rowHeight) * columns,
    visibleEnd: Math.max(0, Math.min(
      displayCount - 1,
      (Math.ceil((relativeScroll + viewportHeight) / rowHeight) + 1) * columns - 1,
    )),
  };
  return {
    ref: setGridElement,
    range,
    rows,
    columns,
    rowHeight,
    displayCount,
    cardWidth,
    itemWidth,
    top: geometry.top,
    height: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
  };
}

/** Render only the rows computed by useVirtualGrid; features supply their data. */
export default function VirtualGrid({
  grid,
  itemKey,
  renderItem,
  columnWeights,
}: {
  grid: ReturnType<typeof useVirtualGrid>;
  itemKey?: (index: number) => React.Key;
  columnWeights?: (start: number, columns: number) => readonly number[];
  renderItem: (index: number, imageSizes: string) => React.ReactNode;
}) {
  const { rows, columns, rowHeight, displayCount, cardWidth, itemWidth, top } = grid;

  return (
    <Box
      ref={grid.ref}
      sx={{
        width: "100%",
        height: grid.height,
        position: "relative",
      }}
    >
      {rows.map((row) => (
        <Box
          key={row.key}
          ref={grid.measureElement}
          data-index={row.index}
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: rowHeight,
            transform: `translateY(${row.start - top}px)`,
            display: "grid",
            gridTemplateColumns: columnWeights
              ? columnWeights(row.index * columns, columns).map(weight => `minmax(0, ${weight}fr)`).join(" ")
              : `repeat(${columns}, minmax(0, 1fr))`,
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
                  width: columnWeights ? "100%" : `min(100%, ${itemWidth}px)`,
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
