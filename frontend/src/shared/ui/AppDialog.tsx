import { overlayContainer } from "shared/lib/overlayContainer";
import { CloseRounded } from "@mui/icons-material";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import React, { useId } from "react";
import type { ReactNode } from "react";

type AppDialogSize = "compact" | "standard";

interface AppDialogProps {
  open: boolean;
  title?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  busy?: boolean;
  size?: AppDialogSize;
  headerContent?: ReactNode;
  contentSx?: SxProps<Theme>;
  contentRef?: React.Ref<HTMLDivElement>;
}

export default function AppDialog({
  open,
  title,
  children,
  onClose,
  actions,
  busy = false,
  size = "standard",
  headerContent,
  contentSx,
  contentRef,
}: AppDialogProps) {
  const titleId = useId();
  const compact = size === "compact";
  const hasTitle = title !== undefined && title !== null;
  const closeButton = (
    <IconButton
      aria-label="Close dialog"
      disabled={busy}
      onClick={onClose}
      sx={{ position: "absolute", top: 8, right: 8, zIndex: 10 }}
    >
      <CloseRounded />
    </IconButton>
  );

  return (
    <Dialog
      container={overlayContainer}
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      disableEscapeKeyDown={busy}
      maxWidth={false}
      aria-labelledby={hasTitle ? titleId : undefined}
      aria-label={hasTitle ? undefined : "Dialog"}
      slotProps={{
        paper: {
          sx: {
            width: compact
              ? { xs: "calc(100% - 32px)", sm: "auto" }
              : { xs: "100%", sm: "90vw" },
            minWidth: compact ? { sm: 360 } : undefined,
            maxWidth: compact ? 440 : 1800,
            maxHeight: compact
              ? "calc(100dvh - 32px)"
              : { xs: "100dvh", sm: "calc(100dvh - 64px)" },
            m: compact ? { xs: 2, sm: 3 } : { xs: 0, sm: 4 },
            borderRadius: compact ? undefined : { xs: 0, sm: 2 },
          },
        },
      }}
    >
      {hasTitle ? (
        <Box sx={{ position: "relative", flexShrink: 0 }}>
          <DialogTitle
            id={titleId}
            sx={{ minHeight: 56, display: "flex", alignItems: "center", pr: 7 }}
          >
            {title}
          </DialogTitle>
          {closeButton}
        </Box>
      ) : (
        closeButton
      )}
      {headerContent}
      <DialogContent ref={contentRef} sx={contentSx}>
        {children}
      </DialogContent>
      {actions !== undefined && <DialogActions>{actions}</DialogActions>}
    </Dialog>
  );
}
