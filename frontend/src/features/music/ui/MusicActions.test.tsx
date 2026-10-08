import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { MediaItemData } from "entities/media/model";
import { TrackRow } from "./TrackRow";
import { MusicMenu } from "./MusicActions";

const mocks = vi.hoisted(() => ({
  play: vi.fn(),
  add: vi.fn(),
  open: vi.fn(),
}));
vi.mock("../model/MusicProvider", () => ({
  useMusic: () => ({
    busy: false,
    track: null,
    play: mocks.play,
    add: mocks.add,
  }),
}));
vi.mock("features/media-lists/public", async (original) => ({
  ...(await original<typeof import("features/media-lists/public")>()),
  openMediaListDialog: mocks.open,
}));
const track = {
  ratingKey: "42",
  type: "track",
  title: "Sample",
  librarySectionID: 4,
} as MediaItemData;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const click = async (element: Element | null) => {
  expect(element).not.toBeNull();
  await act(async () => (element as HTMLElement).click());
};
const menuItem = (label: string) =>
  Array.from(document.querySelectorAll('[role="menuitem"]')).find(
    (item) => item.textContent === label,
  ) ?? null;

it.each(["artist", "album", "track"] as const)(
  "opens the shared playlist dialog from a %s",
  async (type) => {
    const item = { ...track, type };
    await act(async () => root.render(<MusicMenu item={item} />));
    await click(host.querySelector("button"));
    await click(menuItem("Add to playlist…"));
    expect(mocks.open).toHaveBeenCalledWith("playlist", item);
    expect(menuItem("Add to collection…")).toBeNull();
  },
);

it("keeps playlist playback context for both row and menu Play and retains native queue actions", async () => {
  const playPlaylist = vi.fn();
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TrackRow item={track} index={8} numbered onPlay={playPlaylist} />
      </MemoryRouter>,
    ),
  );
  await click(host.querySelector('[aria-label="Play Sample"]'));
  expect(playPlaylist).toHaveBeenCalledTimes(1);
  expect(mocks.play).not.toHaveBeenCalled();
  await click(host.querySelector('[aria-label="Actions for Sample"]'));
  await click(menuItem("Play"));
  expect(playPlaylist).toHaveBeenCalledTimes(2);
  await click(host.querySelector('[aria-label="Actions for Sample"]'));
  await click(menuItem("Play next"));
  expect(mocks.add).toHaveBeenCalledWith(track, true);
});
