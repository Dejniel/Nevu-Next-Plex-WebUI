import {
  clearLibraryCache,
  invalidateLibraryCache,
  subscribeToLibraryCache,
} from "./libraryCache";

it("notifies active library cache owners", () => {
  const listener = jest.fn();
  const unsubscribe = subscribeToLibraryCache(listener);

  invalidateLibraryCache();
  clearLibraryCache();
  unsubscribe();
  invalidateLibraryCache();

  expect(listener.mock.calls).toEqual([["invalidate"], ["clear"]]);
});
