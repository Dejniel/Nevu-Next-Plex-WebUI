import { libraryEntryKey } from "@nevu/contracts";
import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useLibraryViewport,
  useLibraryWindow,
  useLibraryPages,
  type LibraryQuery,
} from "features/library/model";
import {
  photoGalleryGeometry,
  photoViewerRange,
  photoItems,
} from "../model/photos";
import { PhotoViewer } from "./PhotoViewer";
import { PhotoGalleryView } from "./PhotoGalleryView";

export function PhotoGallery({
  query,
  cardSize = 40,
  observeRef,
}: {
  query: LibraryQuery | null;
  cardSize?: number;
  observeRef?: React.RefObject<HTMLElement | null>;
}) {
  const [information, setInformation] = useState(false);
  const [params] = useSearchParams();
  const { grid, range, hasData } = useLibraryViewport(query, {
    ...photoGalleryGeometry(cardSize, information),
    observeRef,
  });
  return (
    <>
      <PhotoGalleryView
        grid={grid}
        range={range}
        hasData={hasData}
        information={information}
        onInformationChange={setInformation}
        chronological={query?.sort.startsWith("originallyAvailableAt")}
        itemKey={libraryEntryKey}
        getItem={(item) => (item.type === "folder" ? undefined : item)}
      />
      {params.has("photo") && <LibraryPhotoViewer query={query} />}
    </>
  );
}

function LibraryPhotoViewer({ query }: { query: LibraryQuery | null }) {
  const [params] = useSearchParams();
  const collection = useLibraryWindow(query);
  const range = useLibraryPages(collection, photoViewerRange(params));
  return (
    <PhotoViewer
      range={{
        ...range,
        items: photoItems(range.items, (item) =>
          item.type === "folder" ? undefined : item,
        ),
      }}
    />
  );
}
