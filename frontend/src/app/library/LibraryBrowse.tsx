import React from "react";
import { Box, Button, ButtonGroup, MenuItem, Select } from "@mui/material";
import { AnimatePresence } from "motion/react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { WatchlistView } from "features/watchlist/routes";
import { MediaListsView } from "features/media-lists/routes";
import { BrowseRecommendations, BrowseLibrary } from "features/library/public";
import { libraryViewTo } from "shared/lib/navigation";

const views = [
  { id: "recommendations", label: "Recommended" },
  { id: "browse", label: "Browse" },
  { id: "watchlist", label: "Watchlist" },
  { id: "collections", label: "Collections" },
  { id: "playlists", label: "Playlists" },
] as const;
type BrowsePages = (typeof views)[number]["id"];

function BrowsePageSelector({
  page,
  setPage,
}: {
  page: BrowsePages;
  setPage: (page: BrowsePages) => void;
}) {
  const location = useLocation();
  return (
    <>
      <Select
        value={page}
        onChange={(event) => setPage(event.target.value as BrowsePages)}
        size="small"
        inputProps={{ "aria-label": "Library view" }}
        sx={{
          display: { xs: "flex", xl: "none" },
          width: 118,
          flexShrink: 0,
          "& .MuiSelect-select": {
            px: 1,
            pr: "28px !important",
            fontSize: "0.8rem",
            fontWeight: 700,
          },
        }}
      >
        {views.map((view) => (
          <MenuItem key={view.id} value={view.id}>
            {view.label}
          </MenuItem>
        ))}
      </Select>
      <ButtonGroup
        variant="outlined"
        sx={{
          display: { xs: "none", xl: "inline-flex" },
          "& .MuiButton-root": {
            minWidth: 100,
            borderColor: "rgba(255,255,255,0.22)",
            color: "text.secondary",
            fontWeight: 700,
            textTransform: "uppercase",
          },
          "& .MuiButton-contained": {
            backgroundColor: "primary.main",
            color: "common.white",
            borderColor: "primary.main",
            boxShadow: "none",
          },
          "& .MuiButton-contained:hover": {
            backgroundColor: "primary.light",
            borderColor: "primary.light",
          },
          "& .MuiButton-outlined:hover": {
            borderColor: "rgba(255,255,255,0.48)",
            backgroundColor: "rgba(255,255,255,0.06)",
          },
        }}
      >
        {views.map((view) => (
          <Button
            key={view.id}
            component={Link}
            to={libraryViewTo(location, view.id)}
            variant={page === view.id ? "contained" : "outlined"}
            aria-pressed={page === view.id}
            onClick={() => {
              if (view.id === "recommendations" || view.id === "browse")
                localStorage.setItem("browsePage", view.id);
            }}
          >
            {view.label}
          </Button>
        ))}
      </ButtonGroup>
    </>
  );
}

function LibraryBrowse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { libraryID } = useParams<{ libraryID: string }>();
  const requestedPage = searchParams.get("view");
  const storedPage = localStorage.getItem("browsePage");
  const page: BrowsePages =
    requestedPage === "browse" ||
    requestedPage === "recommendations" ||
    requestedPage === "watchlist" ||
    requestedPage === "collections" ||
    requestedPage === "playlists"
      ? requestedPage
      : storedPage === "browse"
        ? "browse"
        : "recommendations";
  const setPage = (nextPage: BrowsePages) => {
    if (nextPage === "recommendations" || nextPage === "browse")
      localStorage.setItem("browsePage", nextPage);
    const next = new URLSearchParams(searchParams);
    next.set("view", nextPage);
    next.delete("shelf");
    next.delete("list");
    setSearchParams(next);
  };
  const pageSelector = <BrowsePageSelector page={page} setPage={setPage} />;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        width: "100%",
      }}
    >
      <AnimatePresence mode="wait">
        {page === "recommendations" && (
          <BrowseRecommendations pageNavigation={pageSelector} />
        )}
        {page === "browse" && <BrowseLibrary pageNavigation={pageSelector} />}
        {(page === "collections" || page === "playlists") && (
          <MediaListsView
            key={page}
            kind={page === "collections" ? "collection" : "playlist"}
            libraryID={libraryID}
            pageNavigation={pageSelector}
          />
        )}
        {page === "watchlist" && (
          <WatchlistView libraryID={libraryID} pageNavigation={pageSelector} />
        )}
      </AnimatePresence>
    </Box>
  );
}

export default LibraryBrowse;
