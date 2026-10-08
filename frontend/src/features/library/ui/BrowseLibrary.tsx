import type { LibraryItemType } from "@nevu/contracts";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Select,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { TrackList } from "features/music/public";
import { PhotoGallery } from "features/photos/public";
import { motion } from "motion/react";
import React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useActiveServerScope } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { LibraryBrowseControls } from "./LibraryBrowseControls";
import { useLibraryCardView } from "./LibraryCardViewControls";
import { WindowLibraryCollectionGrid } from "./LibraryCollectionGrid";
import LibraryViewToolbar from "./LibraryViewToolbar";
import { librarySectionQueryOptions } from "../model/libraryDirectories";
import { useLibraryWindow } from "../model/useLibraryPages";
import { useLibraryBrowseState } from "../model/useLibraryBrowseState";

interface BrowseLibraryProps {
  pageNavigation: React.ReactNode;
  allPhotos?: boolean;
}
export default function BrowseLibrary({
  pageNavigation,
  allPhotos = false,
}: BrowseLibraryProps) {
  const { libraryID } = useParams<{ libraryID: string }>();
  return libraryID ? (
    <BrowseLibraryContent
      key={`${libraryID}/${allPhotos}`}
      libraryID={libraryID}
      pageNavigation={pageNavigation}
      allPhotos={allPhotos}
    />
  ) : null;
}
function BrowseLibraryContent({
  libraryID,
  pageNavigation,
  allPhotos,
}: BrowseLibraryProps & { libraryID: string }) {
  const scope = useActiveServerScope();
  const section = useQuery(
    librarySectionQueryOptions(scope, libraryID),
    serverQueryClient,
  );
  const library = section.data;
  const libraryError = section.error?.message;
  const state = useLibraryBrowseState(libraryID, library, { allPhotos });
  const {
    activeItemType,
    video,
    unsupportedLibrary,
    supportedTypes,
    query,
    activeFilters,
    updateFilters,
  } = state;
  const cardView = useLibraryCardView();
  const compactBrowse = useMediaQuery(useTheme().breakpoints.down("sm"));
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const layout = video
    ? cardView.layout
    : activeItemType === "photo" || activeItemType === "photoalbum"
      ? "landscape"
      : "square";
  const range = useLibraryWindow(query);
  const itemCount = range.totalSize?.toLocaleString();
  const typeSelector = (
    <Select
      value={activeItemType || ""}
      onChange={(event) => state.setType(event.target.value as LibraryItemType)}
      size="small"
      disabled={!activeItemType}
      inputProps={{ "aria-label": "Media type" }}
      sx={compactBrowse ? { width: "100%" } : undefined}
    >
      {supportedTypes.map((type) => (
        <MenuItem key={type.key} value={type.type}>
          {type.title}
        </MenuItem>
      ))}
    </Select>
  );

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
          showOrientation={video}
          showLeadingOnMobile
          compactTypeNavigation={compactBrowse ? typeSelector : undefined}
          leading={
            <LibraryBrowseControls state={state} itemCount={itemCount}>
              {!compactBrowse && typeSelector}
            </LibraryBrowseControls>
          }
          pageNavigation={pageNavigation}
        />
      </Box>

      <Box sx={{ width: "100%", px: { xs: 1, md: 6 }, pb: 2 }}>
        <Box sx={{ width: "100%", mt: 2 }}>
          {libraryError ? (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  onClick={() => {
                    void section.refetch();
                  }}
                >
                  Retry
                </Button>
              }
            >
              {libraryError}
            </Alert>
          ) : unsupportedLibrary ? (
            <Alert severity="info">
              This library type is not supported yet.
            </Alert>
          ) : activeItemType === "track" ? (
            <TrackList query={query} />
          ) : activeItemType === "photo" ? (
            <PhotoGallery query={query} cardSize={cardView.size} />
          ) : (
            <WindowLibraryCollectionGrid
              query={query}
              layout={layout}
              cardSize={cardView.size}
              loading={!library}
              observeRef={toolbarRef}
              emptyMessage={
                activeFilters.length
                  ? "No items match these filters."
                  : "This library is empty."
              }
              emptyAction={
                activeFilters.length ? (
                  <Button size="small" onClick={() => updateFilters([])}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
