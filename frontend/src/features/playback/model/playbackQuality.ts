export interface PlaybackQuality {
  bitrate?: number;
}

export function parseStoredPlaybackQuality(value: string | null) {
  if (!value) return {};
  const bitrate = Number.parseInt(value, 10);
  return Number.isFinite(bitrate) ? { bitrate } : {};
}

export function persistPlaybackQuality(quality: PlaybackQuality) {
  if (quality.bitrate === undefined) localStorage.removeItem("quality");
  else localStorage.setItem("quality", quality.bitrate.toString());
}
