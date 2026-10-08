import {
  musicSessionKey,
  readMusicSession,
  saveMusicSession,
} from "./musicSession";
const key = musicSessionKey({ serverId: "server", profileKey: "owner" });
beforeEach(() => localStorage.clear());
it("separates browser checkpoints by server and profile", () => {
  expect(key).not.toBe(
    musicSessionKey({ serverId: "other", profileKey: "owner" }),
  );
  expect(key).not.toBe(
    musicSessionKey({ serverId: "server", profileKey: "managed" }),
  );
});
it.each([
  null,
  "broken",
  {
    selection: { queueID: -1, entryID: 0, ratingKey: "1", position: -7 },
    repeat: "bad",
    volume: 7,
  },
])("ignores malformed checkpoints", (value) => {
  localStorage.setItem(
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  );
  expect(readMusicSession(key)).toEqual({
    selection: null,
    repeat: "off",
    volume: 1,
  });
});
it("does not require browser storage for playback", () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  expect(() =>
    saveMusicSession(key, { selection: null, repeat: "off", volume: 1 }),
  ).not.toThrow();
  spy.mockRestore();
});
