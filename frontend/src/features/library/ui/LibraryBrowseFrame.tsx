import { Box } from "@mui/material";
import React from "react";
import type { useLibraryCardView } from "./LibraryCardViewControls";
import LibraryViewToolbar from "./LibraryViewToolbar";

export default function LibraryBrowseFrame({
  toolbarRef,
  cardView,
  leading,
  pageNavigation,
  filters,
  description,
  children,
}: {
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  cardView: ReturnType<typeof useLibraryCardView>;
  leading: React.ReactNode;
  pageNavigation?: React.ReactNode;
  filters: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ mt: "64px", width: "100%", pb: 8 }}>
      <Box ref={toolbarRef} sx={{ width: "100%" }}>
        <LibraryViewToolbar
          cardView={cardView}
          leading={leading}
          pageNavigation={pageNavigation}
          showLeadingOnMobile
        />
        <Box
          sx={{
            px: { xs: 1, md: 6 },
            py: 1,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
          }}
        >
          {filters}
        </Box>
        {description}
      </Box>
      <Box sx={{ px: { xs: 1, md: 6 }, mt: 2 }}>{children}</Box>
    </Box>
  );
}
