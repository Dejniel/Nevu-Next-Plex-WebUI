type MusicRepeat = "off" | "all" | "one";

interface MusicSelection {
  queueID: number;
  entryID: number;
  ratingKey: string;
  position: number;
}

export interface SavedMusicSession {
  selection: MusicSelection | null;
  repeat: MusicRepeat;
  volume: number;
}

export function musicSessionKey(scope: {
  serverId: string;
  profileKey: string;
}) {
  return `nevu.music.v1:${JSON.stringify([scope.serverId, scope.profileKey])}`;
}

export function readMusicSession(key: string): SavedMusicSession {
  const defaults: SavedMusicSession = {
    selection: null,
    repeat: "off",
    volume: 1,
  };
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return defaults;
    const selection = value.selection;
    return {
      repeat: ["off", "all", "one"].includes(value.repeat)
        ? value.repeat
        : "off",
      volume:
        Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1
          ? value.volume
          : 1,
      selection:
        selection &&
        Number.isSafeInteger(selection.queueID) &&
        selection.queueID > 0 &&
        Number.isSafeInteger(selection.entryID) &&
        selection.entryID > 0 &&
        typeof selection.ratingKey === "string" &&
        /^\d+$/.test(selection.ratingKey) &&
        Number.isFinite(selection.position) &&
        selection.position >= 0
          ? {
              queueID: selection.queueID,
              entryID: selection.entryID,
              ratingKey: selection.ratingKey,
              position: selection.position,
            }
          : null,
    };
  } catch {
    return defaults;
  }
}

export function saveMusicSession(key: string, value: SavedMusicSession) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Playback works when browser storage is unavailable or full.
  }
}
