import { Box } from "@mui/material";
import React from "react";
import {
  LibraryCardViewControls,
  useLibraryCardView,
} from "./LibraryCardViewControls";

interface LibraryViewToolbarProps {
  cardView: ReturnType<typeof useLibraryCardView>;
  leading: React.ReactNode;
  pageNavigation: React.ReactNode;
  showLeadingOnMobile?: boolean;
}

export default function LibraryViewToolbar({
  cardView,
  leading,
  pageNavigation,
  showLeadingOnMobile = false,
}: LibraryViewToolbarProps) {
  return (
    <Box
      sx={{
        zIndex: 10,
        width: "100%",
        px: { xs: 1, md: 6 },
        pt: { xs: 1, md: 0.5 },
        pb: 1,
        position: "relative",
        display: "grid",
        gridTemplateAreas: {
          xs: showLeadingOnMobile ? '"actions" "leading"' : '"actions"',
          lg: '"leading controls pages"',
        },
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          lg: "max-content minmax(0, 1fr) max-content",
        },
        alignItems: "center",
        gap: { xs: 1.25, lg: 1 },
      }}
    >
      <Box
        sx={{
          gridArea: "leading",
          display: { xs: showLeadingOnMobile ? "block" : "none", lg: "block" },
          minWidth: 0,
        }}
      >
        {leading}
      </Box>

      <Box
        sx={{
          gridArea: { xs: "actions", lg: "auto" },
          display: { xs: "flex", lg: "contents" },
          alignItems: "center",
          justifyContent: "space-between",
          gap: 0.5,
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            gridArea: { lg: "controls" },
            minWidth: 0,
            flex: { xs: "1 1 auto", lg: "initial" },
          }}
        >
          <LibraryCardViewControls
            layout={cardView.layout}
            size={cardView.size}
            onSizeChange={cardView.setSize}
            onSizeCommit={cardView.saveSize}
            onLayoutChange={cardView.setLayout}
          />
        </Box>

        <Box
          sx={{
            gridArea: { lg: "pages" },
            display: "flex",
            justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          {pageNavigation}
        </Box>
      </Box>
    </Box>
  );
}
