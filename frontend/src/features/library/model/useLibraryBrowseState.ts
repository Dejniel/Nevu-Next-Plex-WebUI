import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import type {
  LibraryFilterClause,
  LibraryItemType,
  LibrarySort,
} from "@nevu/contracts";
import { isLibraryItemType, isVideoLibraryItemType } from "@nevu/contracts";
import { useActiveServerScope } from "features/session/model";
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
  const supportedTypes = useMemo(
    () => library?.Type?.filter((entry) => isLibraryItemType(entry.type)) || [],
    [library],
  );
  const requestedType = params.get("type");
  const storedType = localStorage.getItem(`typeFilter:${libraryID}`);
  const activeType =
    (parentId || allPhotos
      ? supportedTypes.find((entry) => entry.type === "photo")
      : undefined) ||
    supportedTypes.find((entry) => entry.type === requestedType) ||
    supportedTypes.find((entry) => entry.type === storedType) ||
    supportedTypes.find((entry) => entry.active) ||
    supportedTypes[0];
  const activeItemType = isLibraryItemType(activeType?.type)
    ? activeType.type
    : undefined;
  const video = isVideoLibraryItemType(activeItemType);
  const unsupportedLibrary = Boolean(library && supportedTypes.length === 0);
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
      librarySortOptions(activeType?.Sort).filter(
        (option) => !parentId || !option.random,
      ),
    [activeType, parentId],
  );
  const sortStorageKey = `librarySort:${libraryID}:${activeItemType || "default"}${parentId ? ":children" : allPhotos ? ":photos" : ""}`;
  const requestedSort = params.get("sort");
  const effectiveSort = useMemo(() => {
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
  ]);

  useEffect(() => {
    if (!activeItemType) return;
    const next = new URLSearchParams(serialized);
    next.set("type", activeItemType);
    next.set("sort", effectiveSort);
    if (activeFilters.length) writeLibraryFilterMode(next, filterMode);
    else next.delete(LIBRARY_FILTER_MODE_PARAM);
    writeLibraryFilters(next, activeFilters);
    if (!parentId)
      localStorage.setItem(`typeFilter:${libraryID}`, activeItemType);
    localStorage.setItem(sortStorageKey, effectiveSort);
    if (next.toString() !== serialized)
      setParams(next, { replace: true, state: location.state });
  }, [
    activeItemType,
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
  const setType = (type: LibraryItemType) =>
    navigate((next) => {
      next.set("type", type);
      localStorage.setItem(`typeFilter:${libraryID}`, type);
    });
  const baseQuery = useMemo<Omit<LibraryQuery, "sort" | "seed"> | null>(() => {
    if (!library || !activeItemType || !scope.profileKey) return null;
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
    supportedTypes,
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
    setType,
    reshuffle,
  };
}
export type LibraryBrowseState = ReturnType<typeof useLibraryBrowseState>;
