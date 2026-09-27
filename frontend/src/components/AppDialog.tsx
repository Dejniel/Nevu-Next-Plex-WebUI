import { CloseRounded } from "@mui/icons-material";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import React, { useId } from "react";
import type { ReactNode } from "react";

type AppDialogSize = "compact" | "standard";

interface AppDialogProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  busy?: boolean;
  size?: AppDialogSize;
  headerContent?: ReactNode;
  contentSx?: SxProps<Theme>;
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
}: AppDialogProps) {
  const titleId = useId();
  const compact = size === "compact";

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      disableEscapeKeyDown={busy}
      maxWidth={false}
      aria-labelledby={titleId}
      slotProps={{
        paper: {
          sx: {
            width: compact
              ? { xs: "calc(100% - 32px)", sm: "auto" }
              : { xs: "calc(100% - 32px)", sm: "calc(100% - 48px)" },
            minWidth: compact ? { sm: 360 } : undefined,
            maxWidth: compact ? 440 : 800,
            maxHeight: "calc(100dvh - 32px)",
            m: { xs: 2, sm: 3 },
          },
        },
      }}
    >
      <DialogTitle
        id={titleId}
        sx={{
          minHeight: 56,
          display: "flex",
          alignItems: "center",
          pr: 7,
        }}
      >
        {title}
        <Tooltip title="Close">
          <span>
            <IconButton
              aria-label="Close dialog"
              disabled={busy}
              onClick={onClose}
              sx={{ position: "absolute", top: 8, right: 8 }}
            >
              <CloseRounded />
            </IconButton>
          </span>
        </Tooltip>
      </DialogTitle>
      {headerContent}
      <DialogContent sx={contentSx}>{children}</DialogContent>
      {actions !== undefined && (
        <DialogActions>{actions}</DialogActions>
      )}
    </Dialog>
  );
}
