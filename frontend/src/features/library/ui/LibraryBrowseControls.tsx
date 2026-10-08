import React, { useState } from "react";
import {
  Box,
  IconButton,
  MenuItem,
  Select,
  Skeleton,
  Tooltip,
} from "@mui/material";
import { ShuffleRounded } from "@mui/icons-material";
import type { LibrarySort } from "@nevu/contracts";
import { LibraryFilterSelect } from "./LibraryFilterControls";
import AdvancedLibraryFilterDialog from "./AdvancedLibraryFilterDialog";
import { isRandomLibrarySort } from "../model/librarySort";
import type { LibraryBrowseState } from "../model/useLibraryBrowseState";

export function LibraryBrowseControls({
  state,
  itemCount,
  children,
}: {
  state: LibraryBrowseState;
  itemCount?: string;
  children?: React.ReactNode;
}) {
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const {
    activeFilters,
    filterMode,
    fields,
    filterTypes,
    fieldTypes,
    activeItemType,
    unsupportedLibrary,
    effectiveSort,
    sortOptions,
    query,
    updateFilters,
    setSort,
    reshuffle,
  } = state;
  return (
    <>
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
        {!state.folders && (
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
        )}

        {children}

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            minWidth: 0,
            flex: { xs: "2 1 0", sm: "0 1 auto" },
          }}
        >
          {!state.folders && (
            <Select
              value={effectiveSort}
              onChange={(event) => setSort(event.target.value as LibrarySort)}
              size="small"
              disabled={unsupportedLibrary}
              inputProps={{ "aria-label": "Sort library" }}
              sx={{ minWidth: 0, flex: { xs: "1 1 0", sm: "0 1 auto" } }}
            >
              {sortOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          )}
          {isRandomLibrarySort(effectiveSort) && query && (
            <Tooltip title="Reshuffle">
              <IconButton
                size="small"
                aria-label="Reshuffle library"
                onClick={reshuffle}
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
    </>
  );
}
