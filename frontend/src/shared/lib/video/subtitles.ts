const CUE_TIMING = /^(\s*(?:\d+:)?\d{2}:\d{2})[,.](\d{3})(\s+-->\s+)((?:\d+:)?\d{2}:\d{2})[,.](\d{3})(.*)$/gm;

export function toWebVTT(input: string) {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(text)) return text;

  let cues = 0;
  const body = text.replace(
    CUE_TIMING,
    (_line, start, startMillis, arrow, end, endMillis, settings) => {
      cues += 1;
      return `${start}.${startMillis}${arrow}${end}.${endMillis}${settings}`;
    },
  );
  if (!cues) throw new Error("Plex returned an unsupported subtitle document.");
  return `WEBVTT\n\n${body}`;
}
