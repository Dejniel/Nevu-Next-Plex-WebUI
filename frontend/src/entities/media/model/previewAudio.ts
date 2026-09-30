import { create } from "zustand";

interface PreviewAudioState {
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export const usePreviewAudio = create<PreviewAudioState>((set) => ({
  muted: true,
  setMuted: (muted) => set({ muted }),
}));
