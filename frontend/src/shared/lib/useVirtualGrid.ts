import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import React, { useEffect, useLayoutEffect, useState } from "react";

export interface GridRange {
  start: number;
  end: number;
  visibleStart: number;
  visibleEnd: number;
}

export type VirtualGridGeometry = {
  observeRef?: React.RefObject<HTMLElement | null>;
  scrollElementRef?: React.RefObject<HTMLDivElement | null>;
} & (
  | { layout: "list"; itemHeight: number }
  | {
      layout?: "grid";
      itemWidth: number;
      imageAspectRatio: number;
      footerHeight?: number;
    }
);

type VirtualGridOptions = VirtualGridGeometry & {
  count: number | null;
  minimumCount?: number;
  resetKey?: string | null;
};

export const VIRTUAL_GRID_GAP = 16;

/** Compute the current range before the caller reads its pages. */
export function useVirtualGrid(options: VirtualGridOptions) {
  const {
    count,
    minimumCount = 0,
    resetKey,
    observeRef,
    scrollElementRef,
  } = options;
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = useState({ width: 0, top: 0 });
  const [activeKey, setActiveKey] = useState<string | null | undefined>(
    resetKey,
  );
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

  const list = options.layout === "list";
  const itemWidth = list ? geometry.width : options.itemWidth;
  const columns = list
    ? 1
    : Math.max(
        1,
        Math.floor(
          (geometry.width + VIRTUAL_GRID_GAP) / (itemWidth + VIRTUAL_GRID_GAP),
        ),
      );
  const cardWidth = list
    ? geometry.width
    : geometry.width > 0
      ? Math.min(
          itemWidth,
          (geometry.width - VIRTUAL_GRID_GAP * (columns - 1)) / columns,
        )
      : itemWidth;
  const rowHeight = Math.ceil(
    (list
      ? options.itemHeight
      : cardWidth / options.imageAspectRatio + (options.footerHeight ?? 68)) +
      VIRTUAL_GRID_GAP,
  );
  const displayCount = count ?? Math.max(minimumCount, columns * 6);
  const rowCount = Math.ceil(displayCount / columns);
  const virtualizerOptions = {
    count: rowCount,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin: geometry.top,
    useFlushSync: false,
  };
  const windowGrid = useWindowVirtualizer({
    ...virtualizerOptions,
    enabled: Boolean(gridElement) && positioned && !scrollElementRef,
  });
  const containedGrid = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    ...virtualizerOptions,
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
  const viewportHeight =
    scrollElementRef?.current?.clientHeight ?? window.innerHeight;
  const range: GridRange = {
    start: firstRow * columns,
    end: Math.max(0, Math.min(displayCount - 1, (lastRow + 1) * columns - 1)),
    visibleStart: Math.floor(relativeScroll / rowHeight) * columns,
    visibleEnd: Math.max(
      0,
      Math.min(
        displayCount - 1,
        (Math.ceil((relativeScroll + viewportHeight) / rowHeight) + 1) *
          columns -
          1,
      ),
    ),
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
    list,
    top: geometry.top,
    height: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
  };
}
