import {
  FolderOutlined,
  ChevronRightRounded,
  ArrowUpwardRounded,
} from "@mui/icons-material";
import { Box, Breadcrumbs, Button, Stack, Typography } from "@mui/material";
import type React from "react";
import { libraryEntryKey } from "@nevu/contracts";
import { ActionableMediaCard } from "features/media-actions/public";
import { TrackRow } from "features/music/public";
import { CollectionViewport } from "shared/ui/CollectionViewport";
import { useLibraryViewport } from "../model/useLibraryViewport";
import type { LibraryBrowseState } from "../model/useLibraryBrowseState";

export function FolderBrowse({
  state,
  observeRef,
}: {
  state: LibraryBrowseState;
  observeRef?: React.RefObject<HTMLElement | null>;
}) {
  const { folderPath, setFolderPath } = state;
  const { grid, range, hasData } = useLibraryViewport(state.query, {
    layout: "list",
    itemHeight: 76,
    observeRef,
  });
  return (
    <>
      <Stack
        direction="row"
        sx={{ alignItems: "center", gap: 1, mb: 2, minWidth: 0 }}
      >
        <Button
          startIcon={<ArrowUpwardRounded />}
          disabled={!folderPath.length}
          onClick={() => setFolderPath(folderPath.slice(0, -1))}
        >
          Up
        </Button>
        <Breadcrumbs
          aria-label="Library folders"
          sx={{ minWidth: 0, overflowWrap: "anywhere" }}
        >
          <Button onClick={() => setFolderPath([])}>Folders</Button>
          {folderPath.map((folder, index) =>
            index === folderPath.length - 1 ? (
              <Typography key={folder.id} color="text.primary">
                {folder.title}
              </Typography>
            ) : (
              <Button
                key={folder.id}
                onClick={() => setFolderPath(folderPath.slice(0, index + 1))}
              >
                {folder.title}
              </Button>
            ),
          )}
        </Breadcrumbs>
      </Stack>
      <Box role="list" aria-label="Folder contents">
        <CollectionViewport
          grid={grid}
          range={range}
          hasData={hasData}
          itemKey={libraryEntryKey}
          emptyMessage="This folder is empty."
          renderItem={(item, index) =>
            item.type === "folder" ? (
              <Box role="listitem">
                <Button
                  fullWidth
                  onClick={() =>
                    setFolderPath([
                      ...folderPath,
                      { id: item.id, title: item.title },
                    ])
                  }
                  sx={{
                    height: 76,
                    justifyContent: "flex-start",
                    px: 2,
                    gap: 2,
                    color: "text.primary",
                    textTransform: "none",
                  }}
                >
                  <FolderOutlined
                    sx={{
                      fontSize: 32,
                      color: "text.secondary",
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <Typography noWrap sx={{ fontWeight: 600 }}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Folder
                    </Typography>
                  </Box>
                  <ChevronRightRounded color="disabled" />
                </Button>
              </Box>
            ) : item.type === "track" ? (
              <TrackRow item={item} index={index} />
            ) : (
              <ActionableMediaCard item={item} presentation="list" />
            )
          }
        />
      </Box>
    </>
  );
}
