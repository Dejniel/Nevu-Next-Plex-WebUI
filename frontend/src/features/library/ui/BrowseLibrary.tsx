import type {
  LibraryFilterClause,
  LibraryItemType,
  LibrarySort,
} from "@nevu/contracts";
import { ShuffleRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  Skeleton,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { motion } from "framer-motion";
import React, { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import AdvancedLibraryFilterDialog from "./AdvancedLibraryFilterDialog";
import { LibraryFilterSelect } from "./LibraryFilterControls";
import { useLibraryCardView } from "./LibraryCardViewControls";
import { WindowLibraryCollectionGrid } from "./LibraryCollectionGrid";
import LibraryViewToolbar from "./LibraryViewToolbar";
import { AuthStorage } from "features/session/model";
import { getLibrary } from "../api/libraryDirectories";
import { createLibraryFilterExpression } from "../model/libraryFilterExpression";
import {
  LIBRARY_FILTER_MODE_PARAM,
  libraryFilterFields,
  libraryFiltersForType,
  readLibraryFilterMode,
  readLibraryFilters,
  writeLibraryFilterMode,
  writeLibraryFilters,
} from "../model/libraryFilters";
import {
  defaultLibrarySort,
  isRandomLibrarySort,
  isValidLibrarySort,
  librarySortOptions,
} from "../model/librarySort";
import {
  getLibraryRandomSeed,
  replaceLibraryRandomSeed,
} from "../model/libraryRandom";
import {
  libraryQueryKey,
  libraryRangeStore,
  LibraryQuery,
  useLibraryRange,
} from "../model/LibraryRangeStore";

function isLibraryItemType(value: string | null | undefined): value is LibraryItemType {
  return value === "movie" || value === "show" || value === "episode";
}

export default function BrowseLibrary({
  pageNavigation,
}: {
  pageNavigation: React.ReactNode;
}) {
  const { libraryID } = useParams<{ libraryID: string }>();
  return libraryID ? (
    <BrowseLibraryContent key={libraryID} libraryID={libraryID} pageNavigation={pageNavigation} />
  ) : null;
}

function BrowseLibraryContent({
  libraryID,
  pageNavigation,
}: {
  libraryID: string;
  pageNavigation: React.ReactNode;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [library, setLibrary] = React.useState<Plex.MediaContainer | null>(null);
  const [libraryError, setLibraryError] = React.useState<string | null>(null);
  const [libraryAttempt, setLibraryAttempt] = React.useState(0);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = React.useState(false);
  const [randomSeed, setRandomSeed] = React.useState<{
    context: string;
    value: string;
  } | null>(null);
  const cardView = useLibraryCardView();
  const compactBrowse = useMediaQuery(useTheme().breakpoints.down("sm"));
  const toolbarRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    setLibrary(null);
    setLibraryError(null);
    getLibrary(libraryID)
      .then((data) => {
        if (current) setLibrary(data);
      })
      .catch((error) => {
        if (current)
          setLibraryError(error instanceof Error ? error.message : "Unable to load the library");
      });
    return () => { current = false; };
  }, [libraryAttempt, libraryID]);

  const supportedTypes = React.useMemo(
    () => library?.Type?.filter((entry) => isLibraryItemType(entry.type)) || [],
    [library],
  );
  const requestedType = searchParams.get("type");
  const requestedSort = searchParams.get("sort");
  const storedType = localStorage.getItem(`typeFilter:${libraryID}`);
  const activeType = supportedTypes.find((entry) => entry.type === requestedType) ||
    supportedTypes.find((entry) => entry.type === storedType) ||
    supportedTypes.find((entry) => entry.active) ||
    supportedTypes[0];
  const activeItemType = isLibraryItemType(activeType?.type) ? activeType.type : undefined;
  const unsupportedLibrary = Boolean(library && supportedTypes.length === 0);
  const filterTypes = React.useMemo(
    () => activeType?.Field?.length ? [activeType] : [],
    [activeType],
  );
  const fields = React.useMemo(() => libraryFilterFields(filterTypes), [filterTypes]);
  const fieldTypes = React.useMemo(() => library?.FieldType || [], [library]);
  const parsedFilters = React.useMemo(
    () => readLibraryFilters(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const activeFilters = React.useMemo(
    () => libraryFiltersForType(parsedFilters, fields, fieldTypes),
    [fieldTypes, fields, parsedFilters],
  );
  const filterMode = React.useMemo(
    () => readLibraryFilterMode(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const sortOptions = React.useMemo(
    () => librarySortOptions(activeType?.Sort),
    [activeType],
  );
  const sortStorageKey = `librarySort:${libraryID}:${activeItemType || "default"}`;
  const effectiveSort = React.useMemo(() => {
    const candidates = [
      requestedSort,
      localStorage.getItem(sortStorageKey),
      localStorage.getItem("sortBy"),
    ];
    return candidates
      .filter(isValidLibrarySort)
      .find((candidate) => sortOptions.some((option) => option.value === candidate)) ||
      defaultLibrarySort(activeType?.Sort);
  }, [activeType, requestedSort, sortOptions, sortStorageKey]);

  useEffect(() => {
    if (!activeItemType) return;
    const next = new URLSearchParams(searchParamsString);
    next.set("type", activeItemType);
    next.set("sort", effectiveSort);
    if (activeFilters.length > 0) writeLibraryFilterMode(next, filterMode);
    else next.delete(LIBRARY_FILTER_MODE_PARAM);
    writeLibraryFilters(next, activeFilters);
    localStorage.setItem(`typeFilter:${libraryID}`, activeItemType);
    localStorage.setItem(sortStorageKey, effectiveSort);
    if (next.toString() !== searchParamsString)
      setSearchParams(next, { replace: true });
  }, [
    activeFilters,
    activeItemType,
    effectiveSort,
    filterMode,
    libraryID,
    searchParamsString,
    setSearchParams,
    sortStorageKey,
  ]);

  const updateFilters = React.useCallback((
    filters: readonly LibraryFilterClause[],
    mode: "and" | "or" = filterMode,
  ) => {
    const next = new URLSearchParams(searchParamsString);
    if (filters.length > 0) writeLibraryFilterMode(next, mode);
    else next.delete(LIBRARY_FILTER_MODE_PARAM);
    writeLibraryFilters(next, filters);
    setSearchParams(next);
  }, [filterMode, searchParamsString, setSearchParams]);

  const baseQuery = React.useMemo<Omit<LibraryQuery, "sort" | "seed"> | null>(() => {
    if (!library || !activeItemType) return null;
    const profile = AuthStorage.getActiveSession()?.profile;
    const filterExpression = createLibraryFilterExpression(filterMode, activeFilters);
    return {
      profileKey: profile ? String(profile.id) : "owner",
      sectionId: Number(libraryID),
      type: activeItemType,
      ...(filterExpression && { filterExpression }),
    };
  }, [activeFilters, activeItemType, filterMode, library, libraryID]);

  const randomSeedContext = baseQuery && isRandomLibrarySort(effectiveSort)
    ? JSON.stringify([baseQuery.profileKey, baseQuery.sectionId])
    : null;

  useEffect(() => {
    if (!randomSeedContext || !baseQuery) return;
    setRandomSeed((current) => current?.context === randomSeedContext
      ? current
      : {
        context: randomSeedContext,
        value: getLibraryRandomSeed(baseQuery.profileKey, baseQuery.sectionId),
      });
  }, [baseQuery, randomSeedContext]);

  const query = React.useMemo<LibraryQuery | null>(() => {
    if (!baseQuery) return null;
    if (isRandomLibrarySort(effectiveSort)) {
      if (!randomSeedContext || randomSeed?.context !== randomSeedContext) return null;
      return { ...baseQuery, sort: effectiveSort, seed: randomSeed.value };
    }
    return {
      ...baseQuery,
      sort: effectiveSort,
    };
  }, [baseQuery, effectiveSort, randomSeed, randomSeedContext]);
  const queryKey = React.useMemo(() => query ? libraryQueryKey(query) : null, [query]);
  const range = useLibraryRange(queryKey);
  const itemCount = range.totalSize?.toLocaleString();
  const typeSelector = (
    <Select
      value={activeItemType || ""}
      onChange={(event) => {
        const value = event.target.value as LibraryItemType;
        const next = new URLSearchParams(searchParamsString);
        next.set("type", value);
        localStorage.setItem(`typeFilter:${libraryID}`, value);
        setSearchParams(next);
      }}
      size="small"
      disabled={!activeItemType}
      inputProps={{ "aria-label": "Media type" }}
      sx={compactBrowse ? { width: "100%" } : undefined}
    >
      {supportedTypes.map((type) => (
        <MenuItem key={type.key} value={type.type}>{type.title}</MenuItem>
      ))}
    </Select>
  );

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        width: "100%",
        minHeight: "calc(100vh - 64px)",
        mt: "64px",
      }}
    >
      <Box ref={toolbarRef} sx={{ width: "100%" }}>
        <LibraryViewToolbar
          cardView={cardView}
          showLeadingOnMobile
          compactTypeNavigation={compactBrowse ? typeSelector : undefined}
          leading={
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              flexWrap: { xs: "nowrap", sm: "wrap", lg: "nowrap" },
              gap: 1,
              width: "100%",
              "& .MuiSelect-root": {
                height: 40,
                backgroundColor: "rgba(255,255,255,0.025)",
                transition: "background-color 0.15s ease, border-color 0.15s ease",
                "& .MuiSelect-select": {
                  display: "flex",
                  alignItems: "center",
                  height: "100%",
                  minHeight: "0 !important",
                  boxSizing: "border-box",
                  py: "0 !important",
                },
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: "rgba(255,255,255,0.22)",
                  borderWidth: "1px !important",
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: "rgba(255,255,255,0.42)",
                },
                "&.Mui-focused": {
                  backgroundColor: "rgba(255,255,255,0.06)",
                },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: "rgba(255,255,255,0.5)",
                  borderWidth: "1px !important",
                },
              },
              "& > .MuiSelect-root": {
                flex: { xs: "1 1 0", sm: "1 1 105px", lg: "0 0 auto" },
                minWidth: 0,
              },
            }}
          >
            <LibraryFilterSelect
              filters={activeFilters}
              mode={filterMode}
              fields={fields}
              types={filterTypes}
              fieldTypes={fieldTypes}
              disabled={!activeItemType}
              onChange={(filter) => updateFilters(filter ? [filter] : [], "and")}
              onAdvanced={() => setAdvancedFiltersOpen(true)}
            />

            {!compactBrowse && typeSelector}

            <Box sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              minWidth: 0,
              flex: { xs: "2 1 0", sm: "0 1 auto" },
            }}>
              <Select
                value={effectiveSort}
                onChange={(event) => {
                  const value = event.target.value as LibrarySort;
                  const next = new URLSearchParams(searchParamsString);
                  next.set("sort", value);
                  localStorage.setItem(sortStorageKey, value);
                  setSearchParams(next);
                }}
                size="small"
                disabled={unsupportedLibrary}
                inputProps={{ "aria-label": "Sort library" }}
                sx={{ minWidth: 0, flex: { xs: "1 1 0", sm: "0 1 auto" } }}
              >
                {sortOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </Select>
              {isRandomLibrarySort(effectiveSort) && baseQuery && (
                <Tooltip title="Reshuffle">
                  <IconButton
                    size="small"
                    aria-label="Reshuffle library"
                    onClick={() => {
                      if (queryKey) libraryRangeStore.drop(queryKey);
                      setRandomSeed({
                        context: randomSeedContext as string,
                        value: replaceLibraryRandomSeed(
                          baseQuery.profileKey,
                          baseQuery.sectionId,
                        ),
                      });
                    }}
                  >
                    <ShuffleRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Box
                component="span"
                aria-label="Library item count"
                sx={{
                  minWidth: 36,
                  color: "text.secondary",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {!unsupportedLibrary && (itemCount ?? <Skeleton width={32} />)}
              </Box>
            </Box>
          </Box>
          }
          pageNavigation={pageNavigation}
        />
      </Box>

      <Box sx={{ width: "100%", px: { xs: 1, md: 6 }, pb: 2 }}>
        <Box sx={{ width: "100%", mt: 2 }}>
          {libraryError ? (
            <Alert
              severity="error"
              action={<Button color="inherit" onClick={() => setLibraryAttempt((value) => value + 1)}>Retry</Button>}
            >
              {libraryError}
            </Alert>
          ) : unsupportedLibrary ? (
            <Alert severity="info">This library type is not supported yet.</Alert>
          ) : (
            <WindowLibraryCollectionGrid
              query={query}
              layout={cardView.layout}
              cardSize={cardView.size}
              loading={!library}
              observeRef={toolbarRef}
              emptyMessage={activeFilters.length
                ? "No items match these filters."
                : "This library is empty."}
              emptyAction={activeFilters.length ? (
                <Button size="small" onClick={() => updateFilters([])}>Clear filters</Button>
              ) : undefined}
            />
          )}
        </Box>
      </Box>

      <AdvancedLibraryFilterDialog
        open={advancedFiltersOpen}
        fields={fields}
        types={filterTypes}
        fieldTypes={fieldTypes}
        initialFilters={activeFilters}
        initialMode={filterMode}
        onClose={() => setAdvancedFiltersOpen(false)}
        onApply={(filters, mode) => {
          updateFilters(filters, mode);
          setAdvancedFiltersOpen(false);
        }}
      />

    </Box>
  );
}
