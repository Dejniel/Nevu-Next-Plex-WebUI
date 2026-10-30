import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useBigReader } from "shared/ui";
import { WatchlistReadError } from "../model/watchlistQuery";
import { WatchlistButton } from "./WatchlistButtons";

const toggle = vi.fn();
vi.mock("../model/watchlistQuery", async (original) => ({
  ...(await original<typeof import("../model/watchlistQuery")>()),
  useWatchlistAction: () => ({
    available: true,
    loading: false,
    selected: false,
    toggle,
  }),
}));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  toggle.mockReset();
  useBigReader.getState().closeBigReader();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  useBigReader.getState().closeBigReader();
  vi.unstubAllGlobals();
});

it.each([
  [
    new WatchlistReadError(new Error("Invalid data")),
    "Your Watchlist could not be loaded. Please try again.",
  ],
  [
    new Error("Write failed"),
    "Plex could not update your Watchlist. Please try again.",
  ],
])(
  "distinguishes a list read failure from a membership write failure: %s",
  async (error, message) => {
    toggle.mockRejectedValueOnce(error);
    await act(async () =>
      root.render(
        <WatchlistButton
          item={{
            ratingKey: "1",
            title: "Movie",
            type: "movie",
            guid: "plex://movie/id",
          }}
        />,
      ),
    );
    await act(async () => host.querySelector("button")!.click());
    expect(useBigReader.getState().bigReader).toBe(message);
  },
);
