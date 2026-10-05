import {
  invalidateLibraryCache,
  subscribeToLibraryCache,
} from "./libraryCache";

it("notifies active library cache owners", () => {
  const listener = vi.fn();
  const unsubscribe = subscribeToLibraryCache(listener);

  invalidateLibraryCache();
  unsubscribe();
  invalidateLibraryCache();

  expect(listener.mock.calls).toEqual([[]]);
});
