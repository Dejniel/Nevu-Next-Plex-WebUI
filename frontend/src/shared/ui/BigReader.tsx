import { Typography } from "@mui/material";
import React from "react";
import { create } from "zustand";
import AppDialog from "./AppDialog";

interface BigReaderState {
  bigReader: string | null;
  setBigReader: (bigReader: string) => void;
  closeBigReader: () => void;
}

export const useBigReader = create<BigReaderState>((set) => ({
  bigReader: null,
  setBigReader: (bigReader) => set({ bigReader }),
  closeBigReader: () => set({ bigReader: null }),
}));

function BigReader() {
  const { bigReader, closeBigReader } = useBigReader();
  if (!bigReader) return null;
  return (
    <AppDialog
      open={Boolean(bigReader)}
      title="Information"
      size="compact"
      onClose={closeBigReader}
    >
      <Typography sx={{ whiteSpace: "pre-wrap" }}>{bigReader}</Typography>
    </AppDialog>
  );
}

export default BigReader;
