import { act, useCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useToolbarOverflow,
  type ToolbarMeasurements,
} from "./useToolbarOverflow";

let root: Root;
let host: HTMLDivElement;
let width: number;
const observers: TestResizeObserver[] = [];
class TestResizeObserver {
  observed: Element[] = [];
  disconnected = false;
  constructor(private callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe(element: Element) {
    this.observed.push(element);
  }
  disconnect() {
    this.disconnected = true;
  }
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}
const initial = ["one", "two"];
function Toolbar({ ids = initial }: { ids?: string[] }) {
  const decide = useCallback(
    ({ width, gap, items }: ToolbarMeasurements) =>
      ids.reduce((sum, id) => sum + items[id], 0) + gap <= width
        ? []
        : ids.slice(1),
    [ids],
  );
  const { toolbarRef, overflow } = useToolbarOverflow(decide);
  return (
    <div ref={toolbarRef} style={{ columnGap: 10 }}>
      {ids.map((id) => (
        <div
          key={id}
          data-overflow-item={id}
          inert={overflow.includes(id) || undefined}
          style={{ visibility: overflow.includes(id) ? "hidden" : "visible" }}
        >
          <button>{id}</button>
        </div>
      ))}
      <div data-overflow-item="more">
        <button>More</button>
      </div>
    </div>
  );
}
async function resize(nextWidth: number) {
  width = nextWidth;
  await act(async () => {
    observers.at(-1)!.trigger();
    vi.advanceTimersByTime(20);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => width,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return { width: this.dataset.overflowItem ? 80 : width } as DOMRect;
    },
  );
  width = 300;
  observers.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps measuring hidden slots and restores them when space returns", async () => {
  await act(async () => root.render(<Toolbar />));
  const two = host.querySelector<HTMLElement>('[data-overflow-item="two"]')!;
  expect(observers[0].observed).toHaveLength(4);
  await resize(160);
  expect(two.style.visibility).toBe("hidden");
  await resize(170);
  expect(two.style.visibility).toBe("visible");
});

it("moves keyboard focus to the selector when the focused action becomes hidden", async () => {
  await act(async () => root.render(<Toolbar />));
  host.querySelector<HTMLElement>('[data-overflow-item="two"] button')!.focus();
  await resize(100);
  expect(document.activeElement).toBe(
    host.querySelector('[data-overflow-item="more"] button'),
  );
});

it("rebinds observers when the mounted items change and disconnects on unmount", async () => {
  await act(async () => root.render(<Toolbar />));
  const previous = observers[0];
  await act(async () => root.render(<Toolbar ids={["one", "three"]} />));
  expect(previous.disconnected).toBe(true);
  expect(
    observers[1].observed.map(
      (element) => (element as HTMLElement).dataset.overflowItem,
    ),
  ).toEqual([undefined, "one", "three", "more"]);
  await act(async () => root.unmount());
  expect(observers[1].disconnected).toBe(true);
});
