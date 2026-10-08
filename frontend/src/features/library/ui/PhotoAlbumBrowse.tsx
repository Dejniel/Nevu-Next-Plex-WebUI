import React from "react";
import { Alert, Button } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useActiveServerScope } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { PhotoGallery } from "features/photos/public";
import { librarySectionQueryOptions } from "../model/libraryDirectories";
import { useLibraryBrowseState } from "../model/useLibraryBrowseState";
import { useLibraryWindow } from "../model/useLibraryPages";
import LibraryViewToolbar from "./LibraryViewToolbar";
import { LibraryBrowseControls } from "./LibraryBrowseControls";
import type { LibraryCardView } from "./LibraryCardViewControls";

export function PhotoAlbumBrowse({
  libraryID,
  parentId,
  cardView,
}: {
  libraryID: string;
  parentId: string;
  cardView: LibraryCardView;
}) {
  const scope = useActiveServerScope();
  const section = useQuery(
    librarySectionQueryOptions(scope, libraryID),
    serverQueryClient,
  );
  const state = useLibraryBrowseState(libraryID, section.data, { parentId });
  const collection = useLibraryWindow(state.query);
  if (section.error)
    return (
      <Alert
        severity="error"
        action={<Button onClick={() => void section.refetch()}>Retry</Button>}
      >
        {section.error.message}
      </Alert>
    );
  return (
    <>
      <LibraryViewToolbar
        cardView={cardView}
        showOrientation={false}
        showLeadingOnMobile
        leading={
          <LibraryBrowseControls
            state={state}
            itemCount={collection.totalSize?.toLocaleString()}
          />
        }
        pageNavigation={null}
      />
      <PhotoGallery query={state.query} cardSize={cardView.size} />
    </>
  );
}
