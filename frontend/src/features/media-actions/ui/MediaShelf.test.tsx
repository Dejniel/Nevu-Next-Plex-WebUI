import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { MediaMetadata } from "entities/media/model";
import { MediaShelf, type MediaShelfProps } from "./MediaShelf";

const card = vi.fn(({ item }: { item: MediaMetadata; imageSizes: string }) => (
  <button>{item.title}</button>
));
vi.mock("./ActionableMediaCard", () => ({
  default: (props: Parameters<typeof card>[0]) => card(props),
}));
let root: Root;
let host: HTMLDivElement;
let width: number;
let resize: ResizeObserverCallback;
const data: MediaMetadata[] = Array.from({ length: 20 }, (_, index) => ({
  ratingKey: String(index),
  title: `Movie ${index}`,
  type: "movie",
  guid: `local://${index}`,
}));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  width = 900;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => width,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  card.mockClear();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = (props: Partial<MediaShelfProps> = {}) =>
  act(async () =>
    root.render(
      <MemoryRouter>
        <MediaShelf title="Movies" data={data} {...props} />
      </MemoryRouter>,
    ),
  );
const active = () =>
  Array.from(
    host.querySelectorAll('[aria-roledescription="slide"]:not([inert])'),
  ).map((item) => item.textContent);
const next = () =>
  act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Next Movies page"]')!
      .click(),
  );

it("sizes cards from the actual container, makes every supplied title reachable and renders bounded nearby cards", async () => {
  await render();
  expect(active()).toEqual(["Movie 0", "Movie 1", "Movie 2"]);
  expect(card.mock.calls.at(-1)![0].imageSizes).toBe("294px");
  expect(
    host.querySelectorAll('[aria-roledescription="slide"] button'),
  ).toHaveLength(6);
  const seen = new Set(active());
  for (let page = 1; page < 7; page++) {
    await next();
    active().forEach((title) => seen.add(title));
    expect(
      host.querySelectorAll('[aria-roledescription="slide"] button').length,
    ).toBeLessThanOrEqual(9);
  }
  expect(seen.size).toBe(20);
  await next();
  expect(active()).toEqual(["Movie 0", "Movie 1", "Movie 2"]);
});

it("keeps the current anchor on metadata updates and container resizing, and clamps shrinking results", async () => {
  await render();
  await next();
  await next();
  const updated = data.map((item) => ({ ...item, title: `${item.title}!` }));
  await render({ data: updated });
  expect(active()).toEqual(["Movie 6!", "Movie 7!", "Movie 8!"]);
  await render({ data: [...updated.slice(2), ...updated.slice(0, 2)] });
  expect(active()).toContain("Movie 6!");
  width = 300;
  await act(async () => resize([], {} as ResizeObserver));
  expect(active()).toEqual(["Movie 6!"]);
  expect(card.mock.calls.at(-1)![0].imageSizes).toBe("300px");
  await render({ data: updated.slice(0, 2) });
  expect(active()).toEqual(["Movie 1!"]);
});

it("supports keyboard and horizontal swipes without turning vertical scrolling into pagination", async () => {
  await render();
  await act(async () =>
    host
      .querySelector("section")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
  );
  expect(active()[0]).toBe("Movie 3");
  const viewport = host.querySelector('[aria-label="Movies items"]')!;
  const swipe = async (x: number, y: number) =>
    act(async () => {
      const start = new Event("touchstart", { bubbles: true });
      Object.defineProperty(start, "touches", {
        value: [{ clientX: 200, clientY: 100 }],
      });
      viewport.dispatchEvent(start);
      const end = new Event("touchend", { bubbles: true, cancelable: true });
      Object.defineProperty(end, "changedTouches", {
        value: [{ clientX: x, clientY: y }],
      });
      viewport.dispatchEvent(end);
    });
  await swipe(120, 250);
  expect(active()[0]).toBe("Movie 3");
  await swipe(120, 110);
  expect(active()[0]).toBe("Movie 6");
});

it("shares container-sized skeletons and preserves heading navigation", async () => {
  await render({
    data: [],
    loading: true,
    layout: "poster",
    browseTo: "/watchlist",
  });
  expect(host.querySelector('section[aria-busy="true"]')).not.toBeNull();
  expect(host.querySelectorAll('[aria-roledescription="slide"]')).toHaveLength(
    4,
  );
  expect(host.querySelector('a[href="/watchlist"]')).not.toBeNull();
  await render({ data: data.slice(0, 2), layout: "poster" });
  expect(active()).toEqual(["Movie 0", "Movie 1"]);
  expect(host.querySelector('[aria-label="Movies pages"]')).toBeNull();
});

it("remeasures a restored empty shelf before requesting card-sized artwork", async () => {
  await render();
  await render({ data: [] });
  width = 300;
  card.mockClear();
  await render();
  expect(active()).toEqual(["Movie 0"]);
  expect(card.mock.calls.every(([props]) => props.imageSizes === "300px")).toBe(
    true,
  );
});
