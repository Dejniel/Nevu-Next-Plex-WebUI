import {
  CropLandscapeRounded,
  CropPortraitRounded,
  GridViewRounded,
} from "@mui/icons-material";
import {
  Box,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import React from "react";
import { useUserSettings } from "states/UserSettingsState";

export type LibraryCardLayout = "landscape" | "poster";

export const DEFAULT_CARD_SIZE = 40;

export const normalizeCardSize = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(100, Math.max(0, parsed))
    : DEFAULT_CARD_SIZE;
};

export const getLibraryCardWidth = (
  layout: LibraryCardLayout,
  size: number,
) => Math.round(layout === "poster" ? 140 + size * 1.6 : 190 + size * 2.2);

export function useLibraryCardView() {
  const { settings, setSetting } = useUserSettings();
  const layout: LibraryCardLayout =
    settings.LIBRARY_CARD_LAYOUT === "poster" ? "poster" : "landscape";
  const storedSize = normalizeCardSize(settings.LIBRARY_CARD_SIZE);
  const [draftSize, setDraftSize] = React.useState<number | null>(null);

  return {
    layout,
    size: draftSize ?? storedSize,
    setSize: setDraftSize,
    setLayout: (value: LibraryCardLayout) => {
      void setSetting("LIBRARY_CARD_LAYOUT", value);
    },
    saveSize: (value: number) => {
      setDraftSize(null);
      void setSetting("LIBRARY_CARD_SIZE", String(value));
    },
  };
}

export function LibraryCardViewControls({
  layout,
  size,
  onSizeChange,
  onSizeCommit,
  onLayoutChange,
}: {
  layout: LibraryCardLayout;
  size: number;
  onSizeChange: (value: number) => void;
  onSizeCommit: (value: number) => void;
  onLayoutChange: (value: LibraryCardLayout) => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: { xs: 0.75, sm: 1.25 },
        minWidth: 0,
        width: "100%",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          minWidth: 0,
          maxWidth: 210,
          flex: "1 1 210px",
        }}
      >
        <GridViewRounded sx={{ fontSize: 16, opacity: 0.65, flexShrink: 0 }} />
        <Slider
          aria-label="Library card size"
          min={0}
          max={100}
          step={1}
          value={size}
          onChange={(_, value) => onSizeChange(value as number)}
          onChangeCommitted={(_, value) => onSizeCommit(value as number)}
          size="small"
          sx={{
            minWidth: 0,
            maxWidth: 150,
            flex: "1 1 90px",
            "& .MuiSlider-rail": {
              backgroundColor: "rgba(255,255,255,0.42)",
              opacity: 1,
            },
          }}
        />
        <GridViewRounded sx={{ fontSize: 22, opacity: 0.8, flexShrink: 0 }} />
      </Box>

      <ToggleButtonGroup
        exclusive
        size="small"
        value={layout}
        onChange={(_, value: LibraryCardLayout | null) => {
          if (value) onLayoutChange(value);
        }}
        aria-label="Library card layout"
        sx={{ flexShrink: 0 }}
      >
        <Tooltip title="Landscape cards">
          <ToggleButton value="landscape" aria-label="Landscape cards">
            <CropLandscapeRounded fontSize="small" />
          </ToggleButton>
        </Tooltip>
        <Tooltip title="Poster cards">
          <ToggleButton value="poster" aria-label="Poster cards">
            <CropPortraitRounded fontSize="small" />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Box>
  );
}
