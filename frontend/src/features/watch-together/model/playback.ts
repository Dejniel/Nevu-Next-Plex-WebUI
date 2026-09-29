export function createSharedPlaybackState(
  itemID: string,
  playing: boolean,
  time: number,
): PerPlexed.Sync.PlayBackState {
  return {
    key: itemID,
    state: playing ? "playing" : "paused",
    time,
  };
}

export function shouldCorrectPlaybackPosition(
  currentTime: number,
  remoteTime: number | undefined,
  tolerance = 2,
) {
  return (
    remoteTime !== undefined && Math.abs(currentTime - remoteTime) > tolerance
  );
}

export function sharedPlaybackPath(state: PerPlexed.Sync.PlayBackState) {
  if (!state.key) return null;
  const time = state.time === undefined ? "" : `?t=${state.time}`;
  return `/watch/${state.key}${time}`;
}
