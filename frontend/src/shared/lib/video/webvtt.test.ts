import { appendWebVTTCues } from "./webvtt";

function target() {
  const cues: VTTCue[] = [];
  return {
    cues,
    addCue: (cue: VTTCue) => cues.push(cue),
    removeCue: (cue: VTTCue) => cues.splice(cues.indexOf(cue), 1),
  } as unknown as TextTrack & { cues: VTTCue[] };
}
const encode = (text: string) => new TextEncoder().encode(text);

it("renders an open cue before the next subtitle or the end of the response", async () => {
  let input!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      input = controller;
    },
  });
  const track = target();
  const reading = appendWebVTTCues(body, track, new AbortController().signal);
  input.enqueue(
    encode(
      "WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00.000,MPEGTS:900000\n\n\n00:01.021 --> 00:08.021\nFirst subtitle\n",
    ),
  );
  await vi.waitFor(() =>
    expect(track.cues.map((cue) => cue.text)).toEqual(["First subtitle"]),
  );
  input.enqueue(encode("\n00:05:00.000 --> 00:05:10.000\nSecond subtitle\n"));
  await vi.waitFor(() =>
    expect(track.cues.map((cue) => cue.text)).toEqual([
      "First subtitle",
      "Second subtitle",
    ]),
  );
  input.close();
  await reading;
  expect(track.cues.map((cue) => [cue.startTime, cue.endTime])).toEqual([
    [1.021, 8.021],
    [300, 310],
  ]);
});

it("handles arbitrary UTF-8/CRLF fragmentation and extends multiline text without duplicating cues", async () => {
  const track = target();
  const text =
    "WEBVTT\r\n\r\ncaption-id\r\n00:01.000 --> 00:08.000 align:start\r\n<b>Zażółć</b>\r\nSecond line\r\n\r\n";
  const bytes = encode(text);
  await appendWebVTTCues(
    new ReadableStream({
      start(input) {
        for (const byte of bytes) input.enqueue(new Uint8Array([byte]));
        input.close();
      },
    }),
    track,
    new AbortController().signal,
  );
  expect(track.cues).toHaveLength(1);
  expect(track.cues[0]).toMatchObject({
    id: "caption-id",
    text: "<b>Zażółć</b>\nSecond line",
    align: "start",
  });
});

it("updates an unfinished multiline cue when the following text line arrives", async () => {
  let input!: ReadableStreamDefaultController<Uint8Array>;
  const track = target();
  const reading = appendWebVTTCues(
    new ReadableStream({
      start(c) {
        input = c;
      },
    }),
    track,
    new AbortController().signal,
  );
  input.enqueue(encode("WEBVTT\n\n00:01.000 --> 00:08.000\nFirst line\n"));
  await vi.waitFor(() => expect(track.cues[0]?.text).toBe("First line"));
  input.enqueue(encode("Second li"));
  input.enqueue(encode("ne\n"));
  await vi.waitFor(() =>
    expect(track.cues[0]?.text).toBe("First line\nSecond line"),
  );
  input.close();
  await reading;
  expect(track.cues).toHaveLength(1);
});

it("keeps already read cues across reader restarts without duplicating replayed data", async () => {
  const track = target();
  const document = "WEBVTT\n\n00:01.000 --> 00:08.000\nFirst subtitle\n";
  const read = () =>
    appendWebVTTCues(
      new ReadableStream({
        start(input) {
          input.enqueue(encode(document));
          input.close();
        },
      }),
      track,
      new AbortController().signal,
    );
  await read();
  await read();
  expect(track.cues).toHaveLength(1);
  expect(track.cues[0].text).toBe("First subtitle");
});

it("cancels an idle reader immediately without adding late cues", async () => {
  const cancel = vi.fn();
  const track = target();
  const controller = new AbortController();
  const reading = appendWebVTTCues(
    new ReadableStream({ cancel }),
    track,
    controller.signal,
  );
  controller.abort();
  await expect(reading).rejects.toMatchObject({ name: "AbortError" });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(track.cues).toHaveLength(0);
});

it.each(["", "<html>Failed to load subtitles</html>"])(
  "rejects a missing or invalid document (%s)",
  async (text) => {
    await expect(
      appendWebVTTCues(
        new ReadableStream({
          start(input) {
            input.enqueue(encode(text));
            input.close();
          },
        }),
        target(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("not valid WebVTT");
  },
);
