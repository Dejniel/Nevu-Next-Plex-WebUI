import { WebVTT } from "videojs-vtt.js";

/** Render complete lines of an open cue without waiting for the next cue or EOF.
 * Framing belongs here; WebVTT syntax and native cue properties belong to vtt.js. */
export async function appendWebVTTCues(
  body: ReadableStream<Uint8Array>,
  track: TextTrack,
  signal: AbortSignal,
) {
  const reader = body.getReader();
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  let header: string | null = null;
  let provisional: VTTCue[] = [];
  const cueKey = (cue: VTTCue) =>
    JSON.stringify([
      cue.startTime,
      cue.endTime,
      cue.text,
      cue.id,
      cue.line,
      cue.position,
      cue.size,
      cue.align,
      cue.vertical,
    ]);
  const known = new Map(
    Array.from(track.cues ?? []).map((cue) => [cueKey(cue as VTTCue), cue]),
  );

  const parse = (block: string, complete: boolean) => {
    const cues: VTTCue[] = [];
    const parser = new WebVTT.Parser(window, WebVTT.StringDecoder());
    parser.oncue = (cue) => cues.push(cue);
    parser.onparsingerror = () => {
      throw new Error("The subtitle stream is not valid WebVTT.");
    };
    parser.parse(`${header}\n\n${block}`);
    parser.flush();
    signal.throwIfAborted();
    provisional.forEach((cue) => {
      track.removeCue(cue);
      known.delete(cueKey(cue));
    });
    const added = cues.filter((cue) => !known.has(cueKey(cue)));
    added.forEach((cue) => {
      track.addCue(cue);
      known.set(cueKey(cue), cue);
    });
    provisional = complete ? [] : added;
  };

  const drain = (complete: boolean) => {
    // A CR at the chunk boundary can still be the first half of CRLF.
    buffer = buffer
      .replace(/\r\n/g, "\n")
      .replace(complete ? /\r/g : /\r(?!$)/g, "\n");
    if (header === null) {
      const end = buffer.indexOf("\n\n");
      if (end < 0 && !complete) return;
      header = end < 0 ? buffer : buffer.slice(0, end);
      buffer = end < 0 ? "" : buffer.slice(end + 2);
      parse("", true);
    }
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (block.trim()) parse(block, true);
    }
    const lines = buffer.split("\n");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (
      buffer.trim() &&
      (complete ||
        (buffer.endsWith("\n") && timing >= 0 && timing + 2 < lines.length))
    )
      parse(buffer, complete);
  };

  try {
    signal.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      drain(done);
      if (done) break;
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
