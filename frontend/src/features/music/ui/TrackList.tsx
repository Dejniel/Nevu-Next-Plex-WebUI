import { Box } from "@mui/material";
import { libraryEntryKey } from "@nevu/contracts";
import { useLibraryViewport, type LibraryQuery } from "features/library/model";
import { CollectionViewport } from "shared/ui/CollectionViewport";
import { TrackRow } from "./TrackRow";

export function TrackList({
  query,
  album = false,
}: {
  query: LibraryQuery | null;
  album?: boolean;
}) {
  const { grid, range, hasData } = useLibraryViewport(query, {
    itemWidth: 1_000_000,
    imageAspectRatio: Infinity,
    footerHeight: album ? 60 : 68,
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
