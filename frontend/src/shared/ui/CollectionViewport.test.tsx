import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { useVirtualGrid } from "shared/lib/useVirtualGrid";
import { CollectionViewport } from "./CollectionViewport";

let root: Root, host: HTMLDivElement;
const retry = vi.fn();
const items = new Map([[0, { id: "first" }]]);
const grid = {
  ref: () => {},
  range: { start: 0, end: 2, visibleStart: 0, visibleEnd: 2 },
  rows: [0, 1, 2].map((index) => ({
    key: index,
    index,
    start: index * 84,
    end: (index + 1) * 84,
    size: 84,
    lane: 0,
  })),
  columns: 1,
  rowHeight: 84,
  displayCount: 3,
  cardWidth: 400,
  itemWidth: 400,
  list: true,
  top: 0,
  height: 252,
  measureElement: () => {},
} satisfies ReturnType<typeof useVirtualGrid>;
async function render(
  errors: Map<number, { message: string; retryable: boolean }>,
  hasData = true,
) {
  await act(async () =>
    root.render(
      <CollectionViewport
        grid={grid}
        range={{ items, errors, pageSize: 1, totalSize: 3, retry }}
        hasData={hasData}
        itemKey={(item) => item.id}
        emptyMessage="Empty"
        renderItem={(item) => <span>{item.id}</span>}
      />,
    ),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
it("keeps loaded items visible after a failed refresh", async () => {
  await render(new Map([[0, { message: "Offline", retryable: true }]]));
  expect(host.textContent).toContain("first");
  expect(host.querySelector('[role="alert"]')?.className).toContain(
    "MuiAlert-colorWarning",
  );
});
it("blocks the collection on its initial failure", async () => {
  await render(new Map([[0, { message: "Offline", retryable: true }]]), false);
  expect(host.textContent).toContain("Offline");
  expect(host.textContent).not.toContain("first");
});
it("retries only the failed page instead of leaving its placeholder indefinitely", async () => {
  await render(new Map([[1, { message: "Offline", retryable: true }]]));
  expect(host.textContent).toContain("first");
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(retry).toHaveBeenCalledExactlyOnceWith(1);
});
it("does not offer retries for an access refusal", async () => {
  await render(new Map([[1, { message: "Forbidden", retryable: false }]]));
  expect(host.textContent).toContain("Unable to load this item");
  expect(host.querySelector("button")).toBeNull();
});
