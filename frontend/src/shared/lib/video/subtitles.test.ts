import { describe, expect, it } from "vitest";
import { toWebVTT } from "./subtitles";

describe("toWebVTT", () => {
  it("converts SRT timestamps and line endings", () => {
    expect(
      toWebVTT("\uFEFF1\r\n00:00:49,958 --> 00:00:51,392\r\nText\r\n"),
    ).toBe("WEBVTT\n\n1\n00:00:49.958 --> 00:00:51.392\nText\n");
  });

  it("preserves an existing WebVTT document", () => {
    expect(toWebVTT("WEBVTT\r\n\r\n00:01.000 --> 00:02.000\r\nText\r\n")).toBe(
      "WEBVTT\n\n00:01.000 --> 00:02.000\nText\n",
    );
  });

  it("rejects a response without subtitle cues", () => {
    expect(() => toWebVTT("<html>Not subtitles</html>")).toThrow(
      "not valid WebVTT or SRT",
    );
  });
});
