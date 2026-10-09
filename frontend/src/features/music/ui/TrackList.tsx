import { Box } from "@mui/material";
import type React from "react";
import { libraryEntryKey } from "@nevu/contracts";
import { useLibraryViewport, type LibraryQuery } from "features/library/model";
import { CollectionViewport } from "shared/ui/CollectionViewport";
import { TrackRow } from "./TrackRow";

export function TrackList({
  query,
  album = false,
  observeRef,
}: {
  query: LibraryQuery | null;
  album?: boolean;
  observeRef?: React.RefObject<HTMLElement | null>;
}) {
  const { grid, range, hasData } = useLibraryViewport(query, {
    layout: "list",
    itemHeight: album ? 60 : 68,
    observeRef,
  });
  return (
    <Box role="list" aria-label={album ? "Album tracks" : "Tracks"}>
      <CollectionViewport
        grid={grid}
        range={range}
        hasData={hasData}
        itemKey={libraryEntryKey}
        emptyMessage="No tracks found."
        renderItem={(item, index) =>
          item.type === "folder" ? null : (
            <TrackRow item={item} index={index} album={album} />
          )
        }
      />
    </Box>
  );
}
