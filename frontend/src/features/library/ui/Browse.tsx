import React from "react";
import { Box, Button, ButtonGroup, MenuItem, Select } from "@mui/material";
import { AnimatePresence } from "framer-motion";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import BrowseRecommendations from "./BrowseRecommendations";
import BrowseLibrary from "./BrowseLibrary";
import { libraryViewTo } from "shared/lib/navigation";

type BrowsePages = "recommendations" | "browse";

function BrowsePageSelector({
  page,
  setPage,
  recommendationsTo,
  browseTo,
}: {
  page: BrowsePages;
  setPage: (page: BrowsePages) => void;
  recommendationsTo: ReturnType<typeof libraryViewTo>;
  browseTo: ReturnType<typeof libraryViewTo>;
}) {
  return (
    <>
      <Select
        value={page}
        onChange={(event) => setPage(event.target.value as BrowsePages)}
        size="small"
        aria-label="Library view"
        sx={{
          display: { xs: "flex", lg: "none" },
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
        <MenuItem value="recommendations">Recommended</MenuItem>
        <MenuItem value="browse">Browse</MenuItem>
      </Select>

      <ButtonGroup
        variant="outlined"
        sx={{
          display: { xs: "none", lg: "inline-flex" },
          "& .MuiButton-root": {
            minWidth: 112,
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
        <Button
          component={Link}
          to={recommendationsTo}
          variant={page === "recommendations" ? "contained" : "outlined"}
          aria-pressed={page === "recommendations"}
          onClick={() => localStorage.setItem("browsePage", "recommendations")}
        >
          Recommended
        </Button>
        <Button
          component={Link}
          to={browseTo}
          variant={page === "browse" ? "contained" : "outlined"}
          aria-pressed={page === "browse"}
          onClick={() => localStorage.setItem("browsePage", "browse")}
        >
          Browse
        </Button>
      </ButtonGroup>
    </>
  );
}

function Library() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const requestedPage = searchParams.get("view");
  const storedPage = localStorage.getItem("browsePage");
  const page: BrowsePages =
    requestedPage === "browse" || requestedPage === "recommendations"
      ? requestedPage
      : storedPage === "browse"
        ? "browse"
        : "recommendations";
  const setPage = (nextPage: BrowsePages) => {
    localStorage.setItem("browsePage", nextPage);
    const next = new URLSearchParams(searchParams);
    next.set("view", nextPage);
    next.delete("shelf");
    setSearchParams(next);
  };
  const pageSelector = (
    <BrowsePageSelector
      page={page}
      setPage={setPage}
      recommendationsTo={libraryViewTo(location, "recommendations")}
      browseTo={libraryViewTo(location, "browse")}
    />
  );

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
        {page === "browse" && (
          <BrowseLibrary pageNavigation={pageSelector} />
        )}
      </AnimatePresence>
    </Box>
  );
}

export default Library;
