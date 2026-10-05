import type {
  LibraryFilterClause,
  LibraryFilterMode,
  LibraryFilterOperator,
} from "@nevu/contracts";
import { ArrowBackRounded, CancelRounded, TuneRounded } from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  Divider,
  IconButton,
  ListItemIcon,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import React from "react";
import useLibraryFilterValues from "../model/useLibraryFilterValues";
import {
  libraryFilterFieldTitle,
  libraryFilterIsOperator,
  libraryFilterSource,
} from "../model/libraryFilters";

const CLEAR_VALUE = "__all__";
const BACK_VALUE = "__back__";
const RETRY_VALUE = "__retry__";
const ADVANCED_VALUE = "__advanced__";

interface SelectableField {
  field: Plex.Field;
  operator: NonNullable<ReturnType<typeof libraryFilterIsOperator>>;
  source?: Plex.Filter;
}

export function LibraryFilterSelect({
  filters,
  mode,
  fields,
  types,
  fieldTypes,
  disabled,
  onChange,
  onAdvanced,
}: {
  filters: readonly LibraryFilterClause[];
  mode: LibraryFilterMode;
  fields: readonly Plex.Field[];
  types: readonly Plex.Type[];
  fieldTypes: readonly Plex.FieldType[];
  disabled?: boolean;
  onChange: (filter: LibraryFilterClause | null) => void;
  onAdvanced: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<"fields" | "values">("fields");
  const [fieldKey, setFieldKey] = React.useState("");
  const keepOpen = React.useRef(false);

  const selectableFields = React.useMemo<SelectableField[]>(() => fields.flatMap((field) => {
    const operator = libraryFilterIsOperator(field, fieldTypes);
    const source = libraryFilterSource(field, types);
    return operator && (source || field.type === "boolean")
      ? [{ field, operator, source }]
      : [];
  }), [fieldTypes, fields, types]);
  const selectedField = selectableFields.find(({ field }) => field.key === fieldKey);
  const { options, loading, error, retry } = useLibraryFilterValues(
    selectedField?.source,
    stage === "values",
  );

  const showFields = () => {
    keepOpen.current = true;
    setStage("fields");
    setFieldKey("");
  };

  const handleChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    if (value === CLEAR_VALUE) {
      onChange(null);
      setOpen(false);
      return;
    }
    if (value === BACK_VALUE) {
      showFields();
      return;
    }
    if (value === RETRY_VALUE) {
      keepOpen.current = true;
      retry();
      return;
    }
    if (value === ADVANCED_VALUE) {
      setOpen(false);
      setStage("fields");
      setFieldKey("");
      onAdvanced();
      return;
    }
    if (stage === "fields") {
      const nextField = selectableFields.find(({ field }) => field.key === value);
      if (!nextField) return;
      if (nextField.field.type === "boolean") {
        onChange({
          field: nextField.field.key,
          operator: nextField.operator.key as LibraryFilterOperator,
          value: "1",
        });
        setOpen(false);
        setStage("fields");
        setFieldKey("");
        return;
      }
      keepOpen.current = true;
      setFieldKey(nextField.field.key);
      setStage("values");
      return;
    }

    const optionIndex = Number(value);
    const option = Number.isInteger(optionIndex) ? options[optionIndex] : undefined;
    if (!selectedField || !option) return;
    onChange({
      field: selectedField.field.key,
      operator: selectedField.operator.key as LibraryFilterOperator,
      value: option.value,
      ...(option.label !== option.value && { valueLabel: option.label }),
    });
    setOpen(false);
    setStage("fields");
    setFieldKey("");
  };

  const filter = filters[0];
  const filterField = fields.find((candidate) => candidate.key === filter?.field);
  const selectedLabel = filters.length > 1
    ? `${filters.length} filters · ${mode === "and" ? "All" : "Any"}`
    : filter
      ? filterField?.type === "boolean"
        ? libraryFilterFieldTitle(filterField, fields)
        : `${filterField ? libraryFilterFieldTitle(filterField, fields) : filter.field}: ${filter.valueLabel || filter.value}`
      : "All";

  return (
    <Select
      value=""
      displayEmpty
      open={open}
      onOpen={() => {
        setStage("fields");
        setFieldKey("");
        setOpen(true);
      }}
      onClose={() => {
        if (keepOpen.current) {
          keepOpen.current = false;
          return;
        }
        setOpen(false);
        setStage("fields");
        setFieldKey("");
      }}
      onChange={handleChange}
      renderValue={() => (
        <Box
          component="span"
          sx={{
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            width: "100%",
            height: 22,
          }}
        >
          <Box
            component="span"
            sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {selectedLabel}
          </Box>
          {filters.length > 0 && (
            <IconButton
              component="span"
              role="button"
              aria-label="Clear filter"
              size="small"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange(null);
              }}
              sx={{
                ml: 0.5,
                mr: -0.25,
                p: 0,
                width: 20,
                height: 20,
                flex: "0 0 20px",
                color: "text.secondary",
              }}
            >
              <CancelRounded sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
      )}
      size="small"
      disabled={disabled || !selectableFields.length}
      aria-label="Filter library"
      MenuProps={{ slotProps: { paper: { sx: { maxHeight: 420 } } } }}
      sx={{ minWidth: 170, maxWidth: 280 }}
    >
      {stage === "fields" ? [
        <MenuItem key={CLEAR_VALUE} value={CLEAR_VALUE}>All</MenuItem>,
        ...selectableFields.map(({ field }) => (
          <MenuItem key={field.key} value={field.key}>
            {libraryFilterFieldTitle(field, fields)}
          </MenuItem>
        )),
        <Divider key="advanced-divider" />,
        <MenuItem key={ADVANCED_VALUE} value={ADVANCED_VALUE}>
          <ListItemIcon><TuneRounded fontSize="small" /></ListItemIcon>
          Advanced filters...
        </MenuItem>,
      ] : [
        <MenuItem key={BACK_VALUE} value={BACK_VALUE}>
          <ListItemIcon><ArrowBackRounded fontSize="small" /></ListItemIcon>
          {selectedField ? libraryFilterFieldTitle(selectedField.field, fields) : "Filters"}
        </MenuItem>,
        ...(loading ? [
          <MenuItem key="loading" disabled>
            <CircularProgress size={16} sx={{ mr: 1 }} /> Loading...
          </MenuItem>,
        ] : error ? [
          <MenuItem key={RETRY_VALUE} value={RETRY_VALUE}>Unable to load. Retry</MenuItem>,
        ] : options.length ? options.map((option, index) => (
          <MenuItem key={`${option.value}:${index}`} value={String(index)}>
            {option.label}
          </MenuItem>
        )) : [
          <MenuItem key="empty" disabled>No values available</MenuItem>,
        ]),
      ]}
    </Select>
  );
}
