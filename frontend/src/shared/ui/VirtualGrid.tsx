import { Box } from "@mui/material";
import type React from "react";
import { VIRTUAL_GRID_GAP, type useVirtualGrid } from "shared/lib/useVirtualGrid";

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
            gap: `${VIRTUAL_GRID_GAP}px`,
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
