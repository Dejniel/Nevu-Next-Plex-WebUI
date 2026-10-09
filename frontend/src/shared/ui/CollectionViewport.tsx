import { Box, Button, Skeleton } from "@mui/material";
import type React from "react";
import {
  VIRTUAL_GRID_GAP,
  type useVirtualGrid,
} from "shared/lib/useVirtualGrid";
import VirtualGrid from "./VirtualGrid";
import { QueryErrorAlert } from "./QueryErrorAlert";

interface Range<T> {
  items: ReadonlyMap<number, T>;
  errors: ReadonlyMap<number, { message: string; retryable: boolean }>;
  pageSize: number;
  totalSize: number | null;
  retry: (offset: number) => unknown;
}

/** Presentation-neutral loading, empty and error states for a virtual collection. */
export function CollectionViewport<T>({
  grid,
  range,
  hasData,
  itemKey,
  renderItem,
  renderPlaceholder,
  columnWeights,
  emptyMessage,
  emptyAction,
}: {
  grid: ReturnType<typeof useVirtualGrid>;
  range: Range<T>;
  hasData: boolean;
  itemKey: (item: T) => React.Key;
  renderItem: (item: T, index: number, imageSizes: string) => React.ReactNode;
  renderPlaceholder?: () => React.ReactNode;
  columnWeights?: (start: number, columns: number) => readonly number[];
  emptyMessage: React.ReactNode;
  emptyAction?: React.ReactNode;
}) {
  const initialError = range.errors.get(0);
  // Keep established geometry mounted through refresh/consistency failures.
  // Unmounting it would drop range subscriptions before a window retry.
  const errorAlert = (
    <QueryErrorAlert
      error={initialError}
      hasData={hasData && (range.items.size > 0 || range.totalSize === 0)}
      onRetry={initialError?.retryable ? () => range.retry(0) : undefined}
    />
  );
  if (initialError && !hasData) return errorAlert;
  return (
    <>
      {errorAlert}
      {range.totalSize === 0 ? (
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
      ) : (
        <VirtualGrid
          grid={grid}
          columnWeights={columnWeights}
          itemKey={(index) => {
            const item = range.items.get(index);
            return item ? itemKey(item) : index;
          }}
          renderItem={(index, sizes) => {
            const item = range.items.get(index);
            if (item) return renderItem(item, index, sizes);
            const offset = Math.floor(index / range.pageSize) * range.pageSize;
            const error =
              range.errors.get(offset) ??
              (range.items.size === 0 ? initialError : undefined);
            return error ? (
              <Box
                role="status"
                sx={{
                  height: grid.rowHeight - VIRTUAL_GRID_GAP,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  p: 1,
                }}
              >
                {error.retryable ? (
                  <Button onClick={() => range.retry(offset)}>Retry</Button>
                ) : (
                  "Unable to load this item"
                )}
              </Box>
            ) : renderPlaceholder ? (
              renderPlaceholder()
            ) : (
              <Skeleton
                variant="rounded"
                height={grid.rowHeight - VIRTUAL_GRID_GAP}
              />
            );
          }}
        />
      )}
    </>
  );
}
