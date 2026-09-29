import { shouldIgnorePlaybackShortcut } from "./usePlaybackCommands";

it("ignores playback shortcuts from editable controls", () => {
  const input = document.createElement("input");
  const editable = document.createElement("div");
  editable.setAttribute("contenteditable", "true");
  const nested = document.createElement("span");
  editable.appendChild(nested);

  expect(shouldIgnorePlaybackShortcut(input)).toBe(true);
  expect(shouldIgnorePlaybackShortcut(nested)).toBe(true);
  expect(shouldIgnorePlaybackShortcut(document.body)).toBe(false);
  expect(shouldIgnorePlaybackShortcut(null)).toBe(false);
});
