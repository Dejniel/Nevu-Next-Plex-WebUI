import { Box } from "@mui/material";
import React from "react";
import {
  LibraryCardViewControls,
  type LibraryCardView,
} from "./LibraryCardViewControls";

interface LibraryViewToolbarProps {
  cardView: LibraryCardView;
  leading: React.ReactNode;
  pageNavigation: React.ReactNode;
  showLeadingOnMobile?: boolean;
  compactTypeNavigation?: React.ReactNode;
  showOrientation?: boolean;
  showCardControls?: boolean;
}

export default function LibraryViewToolbar({
  cardView,
  leading,
  pageNavigation,
  showLeadingOnMobile = false,
  compactTypeNavigation,
  showOrientation = true,
  showCardControls = true,
}: LibraryViewToolbarProps) {
  const compact = Boolean(compactTypeNavigation);
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
          xs: compact
            ? showCardControls
              ? '"controls controls" "pages types" "leading leading"'
              : '"pages types" "leading leading"'
            : showLeadingOnMobile
              ? '"actions" "leading"'
              : '"actions"',
          sm: showLeadingOnMobile ? '"actions" "leading"' : '"actions"',
          lg: showCardControls ? '"leading controls pages"' : '"leading pages"',
        },
        gridTemplateColumns: {
          xs: compact ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
          sm: "minmax(0, 1fr)",
          lg: showCardControls
            ? "max-content minmax(0, 1fr) max-content"
            : "minmax(0, 1fr) max-content",
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
          gridArea: {
            xs: compact ? "auto" : "actions",
            sm: "actions",
            lg: "auto",
          },
          display: {
            xs: compact ? "contents" : "flex",
            sm: "flex",
            lg: "contents",
          },
          alignItems: "center",
          justifyContent: "space-between",
          gap: 0.5,
          minWidth: 0,
        }}
      >
        {showCardControls && (
          <Box
            sx={{
              gridArea: {
                xs: compact ? "controls" : "auto",
                sm: "auto",
                lg: "controls",
              },
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
              fullWidthOnSmallScreens={compact}
              showOrientation={showOrientation}
            />
          </Box>
        )}

        <Box
          sx={{
            gridArea: {
              xs: compact ? "pages" : "auto",
              sm: "auto",
              lg: "pages",
            },
            display: "flex",
            justifyContent: "flex-end",
            flexShrink: 0,
            minWidth: 0,
            "& > .MuiSelect-root": compact ? { width: "100%" } : undefined,
          }}
        >
          {pageNavigation}
        </Box>
      </Box>
      {compactTypeNavigation && (
        <Box
          sx={{
            gridArea: "types",
            display: { xs: "block", sm: "none" },
            minWidth: 0,
          }}
        >
          {compactTypeNavigation}
        </Box>
      )}
    </Box>
  );
}
