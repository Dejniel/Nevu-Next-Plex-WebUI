import React from "react";
import { Box, Button, ButtonGroup, MenuItem, Select } from "@mui/material";
import { create } from "zustand";
import { AnimatePresence } from "framer-motion";
import BrowseRecommendations from "./browse/BrowseRecommendations";
import BrowseLibrary from "./browse/BrowseLibrary";

type BrowsePages = "recommendations" | "browse";

interface BrowsePageOptionsState {
  page: BrowsePages;
  setPage: (page: BrowsePages) => void;
}

const useBrowsePageOptions = create<BrowsePageOptionsState>((set) => ({
  page:
    (localStorage.getItem("browsePage") as BrowsePages) || "recommendations",
  setPage: (page: BrowsePages) => {
    localStorage.setItem("browsePage", page);
    set({ page });
  },
}));

function BrowsePageSelector({
  page,
  setPage,
}: {
  page: BrowsePages;
  setPage: (page: BrowsePages) => void;
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
          opacity: 0.7,
          filter: "brightness(0.7)",
          transition: "opacity 0.4s ease, filter 0.4s ease",
          "&:hover": {
            opacity: 1,
            filter: "brightness(1)",
          },
        }}
      >
        <Button
          variant={page === "recommendations" ? "contained" : "outlined"}
          sx={{ fontWeight: "bold", textTransform: "uppercase" }}
          onClick={() => setPage("recommendations")}
        >
          Recommended
        </Button>
        <Button
          variant={page === "browse" ? "contained" : "outlined"}
          sx={{ fontWeight: "bold", textTransform: "uppercase" }}
          onClick={() => setPage("browse")}
        >
          Browse
        </Button>
      </ButtonGroup>
    </>
  );
}

function Library() {
  const { page, setPage } = useBrowsePageOptions();
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
        {page === "browse" && (
          <BrowseLibrary pageNavigation={pageSelector} />
        )}
      </AnimatePresence>
    </Box>
  );
}

export default Library;
