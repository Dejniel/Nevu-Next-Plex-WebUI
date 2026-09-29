import { create } from "zustand";

interface WatchTogetherDialogState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useWatchTogetherDialog = create<WatchTogetherDialogState>(
  (set) => ({
    open: false,
    setOpen: (open) => set({ open }),
  }),
);
