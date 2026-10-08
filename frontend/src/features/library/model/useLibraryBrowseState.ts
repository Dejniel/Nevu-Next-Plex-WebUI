import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import type { LibraryFilterClause, LibrarySort } from "@nevu/contracts";
import { isLibraryItemType, isVideoLibraryItemType } from "@nevu/contracts";
import { useActiveServerScope } from "features/session/model";
import {
  libraryBrowseViews,
  type LibraryBrowseViewId,
} from "entities/library/model";
import {
  readFolderPath,
  writeFolderPath,
  type FolderPath,
} from "./libraryFolders";
import { createLibraryFilterExpression } from "./libraryFilterExpression";
import {
  LIBRARY_FILTER_MODE_PARAM,
  libraryFilterFields,
  libraryFiltersForType,
  readLibraryFilterMode,
  readLibraryFilters,
  writeLibraryFilterMode,
  writeLibraryFilters,
} from "./libraryFilters";
import {
  defaultLibrarySort,
  isRandomLibrarySort,
  isValidLibrarySort,
  librarySortOptions,
} from "./librarySort";
import {
  getLibraryRandomSeed,
  replaceLibraryRandomSeed,
} from "./libraryRandom";
import { libraryRootQueryType, type LibraryQuery } from "./libraryQuery";

/** Shared URL decisions for section browsing and bounded album children. */
export function useLibraryBrowseState(
  libraryID: string,
  library: Plex.MediaContainer | undefined,
  {
    parentId,
    allPhotos = false,
  }: { parentId?: string; allPhotos?: boolean } = {},
) {
  const scope = useActiveServerScope();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const serialized = params.toString();
  const [randomSeed, setRandomSeed] = useState<{
    context: string;
    value: string;
  } | null>(null);
  const supportedViews = useMemo(() => libraryBrowseViews(library), [library]);
  const requestedType = params.get("type");
  const storedType = localStorage.getItem(`typeFilter:${libraryID}`);
  const activeView =
    (parentId || allPhotos
      ? supportedViews.find((entry) => entry.id === "photo")
      : undefined) ||
    supportedViews.find((entry) => entry.id === requestedType) ||
    supportedViews.find((entry) => entry.id === storedType) ||
    supportedViews.find((entry) => entry.descriptor?.active) ||
    supportedViews[0];
  const activeType = activeView?.descriptor;
  const folders = activeView?.source === "folders";
  const rawFolderPath = params.get("folderPath");
  const folderPath = useMemo(
    () => (folders ? readFolderPath(rawFolderPath) : []),
    [folders, rawFolderPath],
  );
  const folderId = folderPath.at(-1)?.id;
  const activeItemType = isLibraryItemType(activeType?.type)
    ? activeType.type
    : undefined;
  const video = isVideoLibraryItemType(activeItemType);
  const unsupportedLibrary = Boolean(library && supportedViews.length === 0);
  const filterTypes = useMemo(
    () => (activeType?.Field?.length ? [activeType] : []),
    [activeType],
  );
  const fields = useMemo(() => libraryFilterFields(filterTypes), [filterTypes]);
  const fieldTypes = useMemo(() => library?.FieldType || [], [library]);
  const parsedFilters = useMemo(
    () => readLibraryFilters(new URLSearchParams(serialized)),
    [serialized],
  );
  const activeFilters = useMemo(
    () => libraryFiltersForType(parsedFilters, fields, fieldTypes),
    [parsedFilters, fields, fieldTypes],
  );
  const filterMode = readLibraryFilterMode(params);
  const sortOptions = useMemo(
    () =>
      librarySortOptions(folders ? [] : activeType?.Sort).filter(
        (option) => (!parentId && !folders) || !option.random,
      ),
    [activeType, parentId, folders],
  );
  const sortStorageKey = `librarySort:${libraryID}:${activeView?.id || "default"}${parentId ? ":children" : allPhotos ? ":photos" : ""}`;
  const requestedSort = params.get("sort");
  const effectiveSort = useMemo(() => {
    if (folders) return "titleSort";
    const candidates = [
      requestedSort,
      localStorage.getItem(sortStorageKey),
      video ? localStorage.getItem("sortBy") : null,
    ];
    return (
      candidates
        .filter(isValidLibrarySort)
        .find((candidate) =>
          sortOptions.some((option) => option.value === candidate),
        ) ||
      (!parentId &&
        activeItemType === "photo" &&
        sortOptions.find(
          (option) => option.value === "originallyAvailableAt:desc",
        )?.value) ||
      defaultLibrarySort(activeType?.Sort)
    );
  }, [
    requestedSort,
    sortStorageKey,
    video,
    sortOptions,
    parentId,
    activeItemType,
    activeType,
    folders,
  ]);

  useEffect(() => {
    if (!activeView) return;
    const next = new URLSearchParams(serialized);
    next.set("type", activeView.id);
    writeFolderPath(next, folderPath);
    next.set("sort", effectiveSort);
    if (activeFilters.length) writeLibraryFilterMode(next, filterMode);
    else next.delete(LIBRARY_FILTER_MODE_PARAM);
    writeLibraryFilters(next, activeFilters);
    if (!parentId)
      localStorage.setItem(`typeFilter:${libraryID}`, activeView.id);
    localStorage.setItem(sortStorageKey, effectiveSort);
    if (next.toString() !== serialized)
      setParams(next, { replace: true, state: location.state });
  }, [
    activeView,
    folderPath,
    effectiveSort,
    activeFilters,
    filterMode,
    serialized,
    setParams,
    libraryID,
    parentId,
    sortStorageKey,
    location.state,
  ]);

  const navigate = useCallback(
    (edit: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(serialized);
      next.delete("photo");
      next.delete("photoIndex");
      edit(next);
      // Album controls edit this page; Back must still return to its container.
      setParams(next, { replace: Boolean(parentId), state: location.state });
    },
    [serialized, setParams, location.state, parentId],
  );
  const updateFilters = useCallback(
    (
      filters: readonly LibraryFilterClause[],
      mode: "and" | "or" = filterMode,
    ) =>
      navigate((next) => {
        if (filters.length) writeLibraryFilterMode(next, mode);
        else next.delete(LIBRARY_FILTER_MODE_PARAM);
        writeLibraryFilters(next, filters);
      }),
    [filterMode, navigate],
  );
  const setSort = (sort: LibrarySort) =>
    navigate((next) => {
      next.set("sort", sort);
      localStorage.setItem(sortStorageKey, sort);
    });
  const setView = (view: LibraryBrowseViewId) =>
    navigate((next) => {
      next.set("type", view);
      next.delete("sort");
      next.delete("folderPath");
      localStorage.setItem(`typeFilter:${libraryID}`, view);
    });
  const setFolderPath = (path: FolderPath) =>
    navigate((next) => writeFolderPath(next, path));
  const baseQuery = useMemo<Omit<LibraryQuery, "sort" | "seed"> | null>(() => {
    if (!library || !activeView || !scope.profileKey) return null;
    if (folders)
      return {
        profileKey: scope.profileKey,
        sectionId: Number(libraryID),
        source: "folders",
        ...(folderId && { folderId }),
      };
    if (!activeItemType) return null;
    const filterExpression = createLibraryFilterExpression(
      filterMode,
      activeFilters,
    );
    return {
      profileKey: scope.profileKey,
      sectionId: Number(libraryID),
      ...(parentId
        ? { source: "children", parentId }
        : { type: libraryRootQueryType(activeItemType, allPhotos) }),
      ...(filterExpression && { filterExpression }),
    };
  }, [
    library,
    activeItemType,
    activeView,
    folders,
    folderId,
    scope.profileKey,
    libraryID,
    parentId,
    allPhotos,
    filterMode,
    activeFilters,
  ]);
  const randomContext =
    baseQuery && isRandomLibrarySort(effectiveSort)
      ? JSON.stringify([baseQuery.profileKey, baseQuery.sectionId])
      : null;
  useEffect(() => {
    if (!randomContext || !baseQuery) return;
    setRandomSeed((current) =>
      current?.context === randomContext
        ? current
        : {
            context: randomContext,
            value: getLibraryRandomSeed(
              baseQuery.profileKey,
              baseQuery.sectionId,
            ),
          },
    );
  }, [baseQuery, randomContext]);
  const query = useMemo<LibraryQuery | null>(() => {
    if (!baseQuery) return null;
    if (!isRandomLibrarySort(effectiveSort))
      return { ...baseQuery, sort: effectiveSort };
    return randomSeed?.context === randomContext
      ? { ...baseQuery, sort: effectiveSort, seed: randomSeed.value }
      : null;
  }, [baseQuery, effectiveSort, randomSeed, randomContext]);
  const reshuffle = () => {
    if (baseQuery && randomContext)
      setRandomSeed({
        context: randomContext,
        value: replaceLibraryRandomSeed(
          baseQuery.profileKey,
          baseQuery.sectionId,
        ),
      });
  };
  return {
    supportedViews,
    activeView,
    folders,
    folderPath,
    activeItemType,
    video,
    unsupportedLibrary,
    fields,
    filterTypes,
    fieldTypes,
    activeFilters,
    filterMode,
    sortOptions,
    effectiveSort,
    query,
    updateFilters,
    setSort,
    setView,
    setFolderPath,
    reshuffle,
  };
}
export type LibraryBrowseState = ReturnType<typeof useLibraryBrowseState>;
