import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { useUserSettings } from "features/settings/model";
import LibraryNavigation from "./LibraryNavigation";

vi.mock("entities/library/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("entities/library/model")>()),
  useLibraries: () => ({
    data: [{ key: "1", uuid: "movies", title: "Movies", type: "movie" }],
  }),
}));
let root: Root;
let host: HTMLDivElement;
let onNavigate: ReturnType<typeof vi.fn<() => void>>;
async function openActions() {
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Actions for Movies"]')!
      .click(),
  );
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 120, 40),
  );
  useUserSettings.getState().reset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onNavigate = vi.fn();
  await act(async () =>
    root.render(
      <MemoryRouter>
        <LibraryNavigation variant="mobile" onNavigate={onNavigate} />
      </MemoryRouter>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps mobile navigation open when dismissing the menu or arranging libraries", async () => {
  await openActions();
  await act(async () =>
    document
      .querySelector('[role="menu"]')!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
  );
  expect(onNavigate).not.toHaveBeenCalled();
  await openActions();
  const arrange = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((element) => element.textContent === "Arrange libraries")!;
  await act(async () => arrange.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Show only library icons",
  );
  expect(onNavigate).not.toHaveBeenCalled();
});

it("closes mobile navigation when selecting a library view", async () => {
  await openActions();
  const watchlist = [
    ...document.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]'),
  ].find((element) => element.textContent === "Watchlist")!;
  expect(watchlist.getAttribute("href")).toBe("/browse/1?view=watchlist");
  await act(async () => watchlist.click());
  expect(onNavigate).toHaveBeenCalledTimes(1);
});
