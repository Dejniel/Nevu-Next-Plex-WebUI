import {
  Alert,
  Button,
  CircularProgress,
  DialogContentText,
} from "@mui/material";
import type { ButtonProps } from "@mui/material";
import React from "react";
import type { ReactNode } from "react";
import AppDialog from "./AppDialog";

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  busyLabel?: string;
  confirmColor?: ButtonProps["color"];
  busy?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel = "Confirm",
  busyLabel = confirmLabel,
  confirmColor = "primary",
  busy = false,
  confirmDisabled = false,
  error,
}: ConfirmDialogProps) {
  return (
    <AppDialog
      open={open}
      title={title}
      size="compact"
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={confirmColor}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            startIcon={busy ? <CircularProgress size={16} /> : undefined}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <DialogContentText>{message}</DialogContentText>
    </AppDialog>
  );
}
