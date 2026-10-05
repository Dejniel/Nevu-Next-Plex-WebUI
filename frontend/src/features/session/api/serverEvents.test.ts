import { connectPlexServerEvents } from "./serverEvents";

jest.mock("shared/api/backend", () => ({
  getBackendURL: () => "https://nevu.test",
}));
let current: FakeStream;
class FakeStream extends EventTarget {
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  close = jest.fn();
  constructor(public url: string) {
    super();
    current = this;
  }
}
const original = globalThis.EventSource;
beforeEach(() => {
  globalThis.EventSource = FakeStream as unknown as typeof EventSource;
});
afterEach(() => {
  globalThis.EventSource = original;
});

it("uses the existing proxy and parses named events without exposing partial media objects", () => {
  const change = jest.fn();
  const close = connectPlexServerEvents("test-token", change);
  const url = new URL(current.url);
  expect(url.origin).toBe("https://nevu.test");
  expect(url.pathname).toBe("/dynproxy/:/eventsource/notifications");
  expect(url.searchParams.get("X-Plex-Token")).toBe("test-token");
  current.dispatchEvent(
    new MessageEvent("timeline", {
      data: JSON.stringify({ TimelineEntry: { type: 1, sectionID: "2" } }),
    }),
  );
  expect(change).toHaveBeenCalledWith({ kind: "library", sectionId: "2" });
  close();
  current.dispatchEvent(new MessageEvent("timeline", { data: "{}" }));
  expect(current.close).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledTimes(1);
});

it("invalidates on reconnection and removes every callback when a profile is closed", () => {
  const change = jest.fn();
  const close = connectPlexServerEvents("test-token", change);
  current.onopen?.();
  expect(change).not.toHaveBeenCalled();
  current.onerror?.();
  current.onopen?.();
  expect(change).toHaveBeenCalledWith({ kind: "server" });
  close();
  expect(current.onopen).toBeNull();
  expect(current.onerror).toBeNull();
});
