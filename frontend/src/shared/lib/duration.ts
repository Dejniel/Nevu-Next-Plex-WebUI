export function durationToText(duration: number) {
  const totalMinutes = Math.floor(duration / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours ? `${hours}h ` : ""}${minutes ? `${minutes}m` : ""}`.trim();
}

export function durationInMinutes(duration: number) {
  return Math.floor(duration / 60000);
}

export function durationToClock(milliseconds: number | undefined) {
  const seconds = Math.floor((milliseconds ?? 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
