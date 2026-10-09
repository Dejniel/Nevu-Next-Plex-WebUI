import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import EpisodeRow from "./EpisodeRow";

const base = {
  ratingKey: "12",
  title: "Example",
  type: "episode",
  index: 1,
  duration: 60_000,
  thumb: "",
  summary: "Episode summary",
} as Plex.Metadata;
let root: Root;
let container: HTMLDivElement;
let path: string;
const callbacks = {
  onToggle: vi.fn(),
  onStartSelection: vi.fn(),
  onCancelSelection: vi.fn(),
  onSetWatched: vi.fn(),
};
function Location() {
  path = useLocation().pathname;
  return null;
}
const render = async (item = base, selecting = false) => {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/show"]}>
        <Location />
        <EpisodeRow
          item={item}
          selecting={selecting}
          selected={selecting}
          busy={false}
          {...callbacks}
        />
      </MemoryRouter>,
    ),
  );
};
beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("renders refreshed watched state directly from the canonical item prop", async () => {
  await render();
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  await render({ ...base, viewCount: 1, title: "Updated title" });
  expect(container.textContent).toContain("Updated title");
  expect(
    container
      .querySelector('[role="progressbar"]')
      ?.getAttribute("aria-valuenow"),
  ).toBe("100");
  await render();
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
});

it("plays through a real link and toggles selection instead of navigating in selection mode", async () => {
  await render();
  expect(
    container
      .querySelector('a[aria-label="Play Example"]')
      ?.getAttribute("href"),
  ).toBe("/watch/12");
  await render(base, true);
  expect(container.querySelector('a[aria-label="Play Example"]')).toBeNull();
  await act(async () =>
    (
      container.querySelector(
        'button[aria-pressed="true"]',
      ) as HTMLButtonElement
    ).click(),
  );
  expect(callbacks.onToggle).toHaveBeenCalledTimes(1);
  expect(path).toBe("/show");
});

it("sends menu intent to the action owner and keeps selection controls distinct", async () => {
  await render();
  await act(async () =>
    (
      container.querySelector(
        'button[aria-haspopup="menu"]',
      ) as HTMLButtonElement
    ).click(),
  );
  const menu = document.querySelector('[role="menu"]')!;
  expect(menu.textContent).toContain("Add to playlist");
  const watched = [
    ...menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((item) => item.textContent?.includes("Mark as Watched"))!;
  await act(async () => watched.click());
  expect(callbacks.onSetWatched).toHaveBeenCalledWith(true);
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
});
