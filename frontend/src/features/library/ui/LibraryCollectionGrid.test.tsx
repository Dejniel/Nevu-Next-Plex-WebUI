import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { getLibraryPage } from "../api/libraryPage";
import {
  libraryRangeStore,
  type LibraryQuery,
} from "../model/LibraryRangeStore";
import { WindowLibraryCollectionGrid } from "./LibraryCollectionGrid";

jest.mock("../api/libraryPage", () => ({ getLibraryPage: jest.fn() }));
jest.mock("features/media-actions/public", () => ({
  ActionableMediaCard: ({ item }: { item: Plex.Metadata }) => (
    <div>{item.title}</div>
  ),
}));
jest.mock("shared/ui/VirtualGrid", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    __esModule: true,
    default: function MockGrid({
      count,
      renderItem,
      onRangeChange,
    }: {
      count: number | null;
      renderItem: (index: number, sizes: string) => React.ReactNode;
      onRangeChange: (range: {
        start: number;
        end: number;
        visibleStart: number;
        visibleEnd: number;
      }) => void;
    }) {
      // Child effects run before the owner's query-retention effect.
      useEffect(() => {
        onRangeChange({ start: 0, end: 20, visibleStart: 0, visibleEnd: 20 });
      }, [onRangeChange]);
      return <div>{count ? renderItem(0, "200px") : null}</div>;
    },
  };
});

it("starts loading after registering the query even if the child already requested a range", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  libraryRangeStore.clear();
  const request = getLibraryPage as jest.Mock;
  request.mockImplementation(async ({ offset, sectionId }) => ({
    offset,
    size: 1,
    totalSize: 1,
    hasMore: false,
    items: [
      {
        ratingKey: String(sectionId),
        guid: "plex://movie/sample",
        title: `Library ${sectionId}`,
      },
    ],
  }));
  const element = document.createElement("div");
  const root = createRoot(element);
  const query: LibraryQuery = {
    profileKey: "owner",
    sectionId: 1,
    sort: "titleSort",
  };
  try {
    await act(async () =>
      root.render(
        <WindowLibraryCollectionGrid
          query={query}
          layout="poster"
          cardSize={40}
        />,
      ),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(element.textContent).toContain("Library 1");
    await act(async () =>
      root.render(
        <WindowLibraryCollectionGrid
          query={{ ...query, sectionId: 2 }}
          layout="poster"
          cardSize={40}
        />,
      ),
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(element.textContent).toContain("Library 2");
  } finally {
    await act(async () => root.unmount());
    libraryRangeStore.clear();
  }
});
