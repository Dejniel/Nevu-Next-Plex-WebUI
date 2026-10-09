import { ArrowBackIosRounded, CheckRounded } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import React from "react";

export function TuneSectionLabel({ children }: React.PropsWithChildren) {
  return (
    <Typography
      variant="caption"
      sx={{
        color: "text.secondary",
        display: "block",
        px: 2,
        pt: 1.5,
        pb: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

export function TuneOption({
  selected,
  disabled = false,
  primary,
  secondary,
  onClick,
}: {
  selected: boolean;
  disabled?: boolean;
  primary: string;
  secondary?: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      sx={{
        border: 0,
        color: "inherit",
        font: "inherit",
        display: "grid",
        gridTemplateColumns: "24px minmax(0, 1fr)",
        alignItems: "center",
        gap: 1,
        width: "100%",
        minHeight: 50,
        px: 2,
        py: 1,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        backgroundColor: "#00000088",
        "&:hover": { backgroundColor: "#000000ee" },
      }}
      onClick={onClick}
    >
      <CheckRounded
        sx={{ opacity: selected ? 1 : 0, color: "primary.main" }}
        fontSize="small"
      />
      <TuneText primary={primary} secondary={secondary} />
    </Box>
  );
}

export function TuneAction({
  icon,
  disabled = false,
  primary,
  secondary,
  onClick,
}: {
  icon: React.ReactNode;
  disabled?: boolean;
  primary: string;
  secondary?: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      sx={{
        display: "grid",
        gridTemplateColumns: "24px minmax(0, 1fr)",
        alignItems: "center",
        gap: 1,
        width: "100%",
        minHeight: 50,
        px: 2,
        py: 1,
        border: 0,
        color: "text.primary",
        cursor: "pointer",
        backgroundColor: "#00000088",
        "&:hover": { backgroundColor: "#000000ee" },
      }}
      onClick={onClick}
    >
      <Box sx={{ display: "flex", color: "primary.main" }}>{icon}</Box>
      <TuneText primary={primary} secondary={secondary} />
    </Box>
  );
}

export function tuneSettingTab(
  setPage: React.Dispatch<React.SetStateAction<number>>,
  props: { pageNum: number; text: string },
) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        height: 50,
        px: 2,
        py: 1.5,
        userSelect: "none",
        cursor: "pointer",
        transition: "all 0.3s ease-in-out",
        backgroundColor: "#00000088",
        "&:hover": {
          transition: "all 0s ease-in-out",
          backgroundColor: "#000000ee",
        },
      }}
      onClick={() => setPage(props.pageNum)}
    >
      <ArrowBackIosRounded sx={{ fontSize: 18, color: "text.secondary" }} />
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 500, flex: 1, textAlign: "right" }}
      >
        {props.text}
      </Typography>
    </Box>
  );
}

function TuneText({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string;
}) {
  return (
    <Box sx={{ minWidth: 0, textAlign: "right" }}>
      <Typography variant="body2" noWrap>
        {primary}
      </Typography>
      {secondary && (
        <Typography
          variant="caption"
          noWrap
          sx={{ color: "text.secondary", display: "block" }}
        >
          {secondary}
        </Typography>
      )}
    </Box>
  );
}
