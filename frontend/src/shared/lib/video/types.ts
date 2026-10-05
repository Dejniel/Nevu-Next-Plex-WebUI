export interface VideoTextTrack {
  url: string;
  language: string;
  label: string;
}

export interface VideoSource {
  id: string;
  url: string;
  type: "file" | "hls" | "dash";
  textTracks?: VideoTextTrack[];
  loadTextTracks?: (
    signal: AbortSignal,
  ) => Promise<{ tracks: VideoTextTrack[] } | { error: VideoPlaybackError }>;
}

export interface VideoPlayerHandle {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number) => void;
}

export interface VideoPlaybackError {
  kind: "network" | "media" | "unsupported" | "subtitle" | "unknown";
  message: string;
  code?: number;
  httpStatus?: number;
}

export interface VideoPlaybackFailure extends VideoPlaybackError {
  sourceId: string;
  position?: number;
}

export interface VideoProgress {
  playedSeconds: number;
  loadedSeconds: number;
}
