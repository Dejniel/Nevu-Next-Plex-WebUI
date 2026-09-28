import { MenuItem, Select } from "@mui/material";
import type { LibrarySort } from "@nevu/contracts";
import React, { SetStateAction } from "react";
import {
  DEFAULT_LIBRARY_SORT,
  isRandomLibrarySort,
  librarySortOptions,
  normalizeLibrarySort,
} from "../model/librarySort";

export type { LibrarySort } from "@nevu/contracts";
export { DEFAULT_LIBRARY_SORT, normalizeLibrarySort } from "../model/librarySort";

function LibrarySortDropDown({
  sortHook,
}: {
  sortHook: [string, React.Dispatch<SetStateAction<LibrarySort>>];
}) {
  const [option, setOption] = sortHook;
  const options = librarySortOptions();
  const value = options.some((candidate) => candidate.value === option)
    ? option
    : DEFAULT_LIBRARY_SORT;

  React.useEffect(() => {
    if (option === value) return;
    setOption(value);
    localStorage.setItem("sortBy", value);
  }, [option, setOption, value]);

  return (
    <Select
      value={value}
      onChange={(e) => {
        setOption(e.target.value as LibrarySort);
        localStorage.setItem("sortBy", e.target.value);
      }}
    >
      {options.map((sort) => (
        <MenuItem key={sort.value} value={sort.value}>{sort.label}</MenuItem>
      ))}
    </Select>
  );
}

export function sortMetadata(items: Plex.Metadata[], sort: LibrarySort) {
  const result = [...items];
  if (isRandomLibrarySort(sort)) return result.sort(() => Math.random() - 0.5);

  const [fieldExpression, direction = "asc"] = sort.split(",")[0].split(":");
  const field = fieldExpression.split(".").at(-1) || fieldExpression;
  const metadataField = field === "titleSort" ? "title" : field;
  const multiplier = direction === "desc" ? -1 : 1;
  return result.sort((left, right) => {
    const leftValue = (left as unknown as Record<string, unknown>)[metadataField];
    const rightValue = (right as unknown as Record<string, unknown>)[metadataField];
    if (typeof leftValue === "number" && typeof rightValue === "number")
      return (leftValue - rightValue) * multiplier;
    return String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * multiplier;
  });
}

export default LibrarySortDropDown;
