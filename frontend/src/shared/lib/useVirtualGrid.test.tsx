import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useVirtualGrid, type VirtualGridGeometry } from "./useVirtualGrid";

let root: Root,
  state: ReturnType<typeof useVirtualGrid>,
  width: number,
  top: number;
const observers: TestResizeObserver[] = [];
class TestResizeObserver {
  observed: Element[] = [];
  constructor(private callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe(element: Element) {
    this.observed.push(element);
  }
  unobserve() {}
  disconnect() {}
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}
function Viewport({ geometry }: { geometry: VirtualGridGeometry }) {
  const toolbar = useRef<HTMLDivElement>(null);
  state = useVirtualGrid({ ...geometry, count: 100, observeRef: toolbar });
  return (
    <>
      <div ref={toolbar} data-toolbar />
      <div ref={state.ref} />
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      width,
      height: 800,
      top,
      left: 0,
      right: width,
      bottom: top + 800,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
  );
  width = 760;
  top = 160;
  observers.length = 0;
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("uses one full-width column with the specified item height for lists", async () => {
  await act(async () =>
    root.render(<Viewport geometry={{ layout: "list", itemHeight: 68 }} />),
  );
  expect(state.columns).toBe(1);
  expect(state.cardWidth).toBe(760);
  expect(state.rowHeight).toBe(84);
  await act(async () => {
    width = 1500;
    observers[0].trigger();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(state.columns).toBe(1);
  expect(state.cardWidth).toBe(1500);
});
it("keeps card geometry and updates the scroll margin when the toolbar changes height", async () => {
  await act(async () =>
    root.render(
      <Viewport geometry={{ itemWidth: 240, imageAspectRatio: 1.5 }} />,
    ),
  );
  expect(state.columns).toBe(3);
  expect(state.rowHeight).toBe(244);
  expect(state.top).toBe(160);
  expect(
    observers[0].observed.some((element) =>
      element.hasAttribute("data-toolbar"),
    ),
  ).toBe(true);
  await act(async () => {
    top = 240;
    observers[0].trigger();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(state.top).toBe(240);
});
