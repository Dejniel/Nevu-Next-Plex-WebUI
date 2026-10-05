import { ShuffleRounded } from "@mui/icons-material";
import { Box, IconButton, MenuItem, Select, Tooltip } from "@mui/material";
import React from "react";
import {
  getLibraryRandomSeed,
  replaceLibraryRandomSeed,
} from "../model/libraryRandom";
import {
  isRandomLibrarySort,
  librarySortOptions,
} from "../model/librarySort";
import {
  libraryRangeStore,
} from "../model/LibraryRangeStore";
import { libraryQueryKey, type LibraryQuery } from "../model/libraryQuery";
import { AppDialog } from "shared/ui";
import {
  LibraryCardViewControls,
  useLibraryCardView,
} from "./LibraryCardViewControls";
import { ContainedLibraryCollectionGrid } from "./LibraryCollectionGrid";

interface LibraryCollectionDialogProps {
  open: boolean;
  title: string;
  baseQuery: LibraryQuery | null;
  sortDefinitions?: Plex.Sort[];
  sortable?: boolean;
  cardView: ReturnType<typeof useLibraryCardView>;
  emptyMessage?: string;
  onClose: () => void;
}

export default function LibraryCollectionDialog({
  open,
  title,
  baseQuery,
  sortDefinitions,
  sortable = baseQuery?.source !== "onDeck",
  cardView,
  emptyMessage,
  onClose,
}: LibraryCollectionDialogProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const baseQueryKey = baseQuery ? libraryQueryKey(baseQuery) : "closed";
  const [selection, setSelection] = React.useState({
    baseQueryKey,
    sort: baseQuery?.sort || "titleSort",
    randomSeed: null as string | null,
  });
  const sort = selection.baseQueryKey === baseQueryKey
    ? selection.sort
    : baseQuery?.sort || "titleSort";
  const randomSeed = selection.baseQueryKey === baseQueryKey
    ? selection.randomSeed
    : null;
  const declaredSortOptions = React.useMemo(
    () => librarySortOptions(sortDefinitions),
    [sortDefinitions],
  );
  const sortOptions = React.useMemo(() => {
    if (!baseQuery || declaredSortOptions.some((option) => option.value === baseQuery.sort))
      return declaredSortOptions;
    return [{
      value: baseQuery.sort,
      label: "Recommended order",
      random: false,
    }, ...declaredSortOptions];
  }, [baseQuery, declaredSortOptions]);
  const query = React.useMemo<LibraryQuery | null>(() => {
    if (!baseQuery) return null;
    const { seed: _seed, ...base } = baseQuery;
    if (!isRandomLibrarySort(sort)) return { ...base, sort };
    return {
      ...base,
      sort,
      seed: randomSeed || getLibraryRandomSeed(base.profileKey, base.sectionId),
    };
  }, [baseQuery, randomSeed, sort]);

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={title}
      contentRef={contentRef}
      contentSx={{ p: 0 }}
      headerContent={baseQuery ? (
        <Box
          sx={{
            px: { xs: 1.5, sm: 3 },
            pb: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1.5,
          }}
        >
          {sortable ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Select
                size="small"
                value={sort}
                onChange={(event) => setSelection({
                  baseQueryKey,
                  sort: event.target.value,
                  randomSeed: null,
                })}
                aria-label="Sort collection"
              >
                {sortOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </Select>
              {isRandomLibrarySort(sort) && query && (
                <Tooltip title="Reshuffle">
                  <IconButton
                    size="small"
                    aria-label="Reshuffle collection"
                    onClick={() => {
                      const previousKey = libraryQueryKey(query);
                      const nextSeed = replaceLibraryRandomSeed(
                        query.profileKey,
                        query.sectionId,
                      );
                      libraryRangeStore.drop(previousKey);
                      setSelection({ baseQueryKey, sort, randomSeed: nextSeed });
                    }}
                  >
                    <ShuffleRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ) : <Box />}
          <Box sx={{ width: { xs: "100%", sm: 330 }, ml: "auto" }}>
            <LibraryCardViewControls
              layout={cardView.layout}
              size={cardView.size}
              onSizeChange={cardView.setSize}
              onSizeCommit={cardView.saveSize}
              onLayoutChange={cardView.setLayout}
            />
          </Box>
        </Box>
      ) : undefined}
    >
      <Box sx={{ px: { xs: 1, sm: 3 }, py: 2, minHeight: "55vh" }}>
        <ContainedLibraryCollectionGrid
          query={query}
          layout={cardView.layout}
          cardSize={cardView.size}
          scrollElementRef={contentRef}
          emptyMessage={emptyMessage}
        />
      </Box>
    </AppDialog>
  );
}
