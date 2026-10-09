import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useItemSelection } from "./useItemSelection";

let root: Root;
let selection: ReturnType<typeof useItemSelection>;
function Harness({ scope = "library" }: { scope?: string }) {
  selection = useItemSelection(scope);
  return null;
}
beforeEach(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("stores IDs and applies consecutive toggles to the latest selection", async () => {
  await act(async () => {
    selection.start("a");
    selection.toggle("b");
    selection.toggle("a");
  });
  expect(selection.active).toBe(true);
  expect([...selection.ids]).toEqual(["b"]);
  await act(async () => selection.clear());
  expect(selection.active).toBe(false);
  expect(selection.ids.size).toBe(0);
});

it("selects/deselects a page by identity without discarding other pages", async () => {
  await act(async () => selection.start("previous"));
  await act(async () => selection.toggleAll(["a", "b", "a"]));
  expect([...selection.ids]).toEqual(["previous", "a", "b"]);
  await act(async () => selection.toggleAll(["a", "b"]));
  expect([...selection.ids]).toEqual(["previous"]);
});

it("does not mistake equal counts for the same selection", async () => {
  await act(async () => selection.toggleAll(["a", "b"]));
  await act(async () => selection.toggleAll(["c", "d"]));
  expect([...selection.ids]).toEqual(["a", "b", "c", "d"]);
});

it("resets selection immediately when the catalog, season or session scope changes", async () => {
  await act(async () => selection.start("a"));
  await act(async () => root.render(<Harness scope="another" />));
  expect(selection.active).toBe(false);
  expect(selection.ids.size).toBe(0);
  await act(async () => root.render(<Harness />));
  expect(selection.ids.size).toBe(0);
  await act(async () => root.render(<Harness scope="another" />));
  await act(async () => selection.toggle("b"));
  expect([...selection.ids]).toEqual(["b"]);
  await act(async () => root.render(<Harness />));
  expect(selection.ids.size).toBe(0);
});

it("keeps only failed IDs for a partial retry", async () => {
  await act(async () => selection.toggleAll(["a", "b", "c"]));
  await act(async () => selection.retain(["b", "missing"]));
  expect(selection.active).toBe(true);
  expect([...selection.ids]).toEqual(["b"]);
});
