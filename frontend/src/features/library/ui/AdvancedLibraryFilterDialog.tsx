import type {
  LibraryFilterClause,
  LibraryFilterMode,
  LibraryFilterOperator,
} from "@nevu/contracts";
import { AddRounded, DeleteOutlineRounded } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  createFilterOptions,
  IconButton,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import React from "react";
import useLibraryFilterValues from "../model/useLibraryFilterValues";
import {
  isLibraryFilterClause,
  libraryFilterFieldTitle,
  libraryFilterOperators,
  libraryFilterSource,
  LibraryFilterValueOption,
  MAX_LIBRARY_FILTERS,
  normalizeLibraryFilters,
} from "../model/libraryFilters";
import AppDialog from "components/AppDialog";

interface FilterDraft {
  id: number;
  field: string;
  operator: LibraryFilterOperator | "";
  value: string;
  valueLabel?: string;
}

interface AdvancedLibraryFilterDialogProps {
  open: boolean;
  fields: readonly Plex.Field[];
  types: readonly Plex.Type[];
  fieldTypes: readonly Plex.FieldType[];
  initialFilters: readonly LibraryFilterClause[];
  initialMode: LibraryFilterMode;
  onClose: () => void;
  onApply: (filters: LibraryFilterClause[], mode: LibraryFilterMode) => void;
}

const filterValueOptions = createFilterOptions<LibraryFilterValueOption>({ limit: 100 });
let nextDraftId = 1;

function createDraft(
  fields: readonly Plex.Field[],
  fieldTypes: readonly Plex.FieldType[],
  filter?: LibraryFilterClause,
): FilterDraft | null {
  const field = fields.find((candidate) => candidate.key === filter?.field) || fields[0];
  if (!field) return null;
  const operators = libraryFilterOperators(field, fieldTypes);
  const operator = operators.some((candidate) => candidate.key === filter?.operator)
    ? filter?.operator as LibraryFilterOperator
    : operators[0]?.key as LibraryFilterOperator | undefined;
  if (!operator) return null;
  return {
    id: nextDraftId++,
    field: field.key,
    operator,
    value: filter?.value || (field.type === "boolean" ? "1" : ""),
    ...(filter?.valueLabel && { valueLabel: filter.valueLabel }),
  };
}

function clauseFromDraft(draft: FilterDraft): LibraryFilterClause | null {
  const value = draft.value.trim();
  const clause = {
    field: draft.field,
    operator: draft.operator,
    value,
    ...(draft.valueLabel?.trim() && draft.valueLabel.trim() !== value && {
      valueLabel: draft.valueLabel.trim(),
    }),
  };
  return isLibraryFilterClause(clause) ? clause : null;
}

function FilterValueEditor({
  draft,
  field,
  operator,
  source,
  onChange,
}: {
  draft: FilterDraft;
  field: Plex.Field;
  operator: Plex.Operator | undefined;
  source: Plex.Filter | undefined;
  onChange: (patch: Partial<FilterDraft>) => void;
}) {
  const operatorTitle = operator?.title.trim().toLowerCase();
  const useOptions = field.type !== "boolean" && Boolean(source) &&
    (operatorTitle === "is" || operatorTitle === "is not");
  const { options, loading, error, retry } = useLibraryFilterValues(source, useOptions);

  if (field.type === "boolean") {
    return (
      <TextField
        select
        label="Value"
        value={draft.value || "1"}
        onChange={(event) => onChange({ value: event.target.value, valueLabel: undefined })}
        size="small"
        fullWidth
      >
        <MenuItem value="1">Yes</MenuItem>
        <MenuItem value="0">No</MenuItem>
      </TextField>
    );
  }

  if (useOptions) {
    const selected = options.find((option) => option.value === draft.value) ||
      (draft.value ? { value: draft.value, label: draft.valueLabel || draft.value } : null);
    return (
      <Autocomplete<LibraryFilterValueOption>
        options={options}
        filterOptions={filterValueOptions}
        value={selected}
        loading={loading}
        isOptionEqualToValue={(option, value) => option.value === value.value}
        getOptionLabel={(option) => option.label}
        onChange={(_, value) => onChange({
          value: value?.value || "",
          valueLabel: value?.label,
        })}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Value"
            size="small"
            error={error}
            helperText={error ? (
              <Button
                size="small"
                color="inherit"
                onClick={retry}
                sx={{ minWidth: 0, p: 0 }}
              >
                Unable to load values. Retry
              </Button>
            ) : undefined}
            slotProps={{
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading && <CircularProgress color="inherit" size={16} />}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
    );
  }

  return (
    <TextField
      label="Value"
      value={draft.value}
      onChange={(event) => onChange({
        value: event.target.value,
        valueLabel: event.target.value,
      })}
      type={field.type === "date" ? "date" : field.type === "integer" ? "number" : "text"}
      slotProps={{ inputLabel: field.type === "date" ? { shrink: true } : undefined }}
      size="small"
      fullWidth
    />
  );
}

export default function AdvancedLibraryFilterDialog({
  open,
  fields,
  types,
  fieldTypes,
  initialFilters,
  initialMode,
  onClose,
  onApply,
}: AdvancedLibraryFilterDialogProps) {
  const availableFields = React.useMemo(
    () => fields.filter((field) => libraryFilterOperators(field, fieldTypes).length),
    [fieldTypes, fields],
  );
  const [mode, setMode] = React.useState<LibraryFilterMode>(initialMode);
  const [drafts, setDrafts] = React.useState<FilterDraft[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    const initialDrafts = initialFilters.flatMap((filter) => {
      const draft = createDraft(availableFields, fieldTypes, filter);
      return draft ? [draft] : [];
    });
    if (initialDrafts.length) setDrafts(initialDrafts);
    else {
      const draft = createDraft(availableFields, fieldTypes);
      setDrafts(draft ? [draft] : []);
    }
  }, [availableFields, fieldTypes, initialFilters, initialMode, open]);

  const updateDraft = (id: number, patch: Partial<FilterDraft>) => {
    setDrafts((current) => current.map((draft) =>
      draft.id === id ? { ...draft, ...patch } : draft));
  };
  const clauses = drafts.flatMap((draft) => {
    const clause = clauseFromDraft(draft);
    return clause ? [clause] : [];
  });
  const canApply = clauses.length === drafts.length;

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Advanced filters"
      actions={(
        <Button
          variant="contained"
          disabled={!canApply}
          onClick={() => {
            onApply(normalizeLibraryFilters(clauses), mode);
          }}
        >
          Apply
        </Button>
      )}
      contentSx={{ px: { xs: 1.5, sm: 3 }, py: 2 }}
    >
      <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
              mb: 2,
            }}
          >
            <ToggleButtonGroup
              value={mode}
              exclusive
              size="small"
              aria-label="Filter matching mode"
              onChange={(_, value: LibraryFilterMode | null) => {
                if (value) setMode(value);
              }}
            >
              <ToggleButton value="and">Match all</ToggleButton>
              <ToggleButton value="or">Match any</ToggleButton>
            </ToggleButtonGroup>
            {drafts.length > 0 && (
              <Button color="inherit" size="small" onClick={() => setDrafts([])}>
                Clear all
              </Button>
            )}
          </Box>

          {drafts.length === 0 ? (
            <Box sx={{ py: 4, color: "text.secondary", textAlign: "center" }}>
              No filters. All library items will be shown.
            </Box>
          ) : drafts.map((draft) => {
            const field = availableFields.find((candidate) => candidate.key === draft.field) ||
              availableFields[0];
            const operators = libraryFilterOperators(field, fieldTypes);
            const operator = operators.find((candidate) => candidate.key === draft.operator);
            const source = libraryFilterSource(field, types);
            return (
              <Box
                key={draft.id}
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", md: "row" },
                  alignItems: { xs: "stretch", md: "flex-start" },
                  gap: 1.25,
                  py: 1.5,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <TextField
                  select
                  label="Field"
                  value={field.key}
                  onChange={(event) => {
                    const nextField = availableFields.find(
                      (candidate) => candidate.key === event.target.value,
                    ) || availableFields[0];
                    const nextOperator = libraryFilterOperators(nextField, fieldTypes)[0];
                    updateDraft(draft.id, {
                      field: nextField.key,
                      operator: (nextOperator?.key as LibraryFilterOperator | undefined) || "",
                      value: nextField.type === "boolean" ? "1" : "",
                      valueLabel: undefined,
                    });
                  }}
                  size="small"
                  fullWidth
                  sx={{ flex: "1 1 220px" }}
                >
                  {availableFields.map((candidate) => (
                    <MenuItem key={candidate.key} value={candidate.key}>
                      {libraryFilterFieldTitle(candidate, availableFields)}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  label="Condition"
                  value={draft.operator}
                  onChange={(event) => updateDraft(draft.id, {
                    operator: event.target.value as LibraryFilterOperator,
                    value: field.type === "boolean" ? draft.value || "1" : "",
                    valueLabel: undefined,
                  })}
                  size="small"
                  fullWidth
                  sx={{ flex: "1 1 190px" }}
                >
                  {operators.map((candidate) => (
                    <MenuItem key={candidate.key} value={candidate.key}>{candidate.title}</MenuItem>
                  ))}
                </TextField>

                <Box sx={{ flex: "2 1 280px", minWidth: 0 }}>
                  <FilterValueEditor
                    draft={draft}
                    field={field}
                    operator={operator}
                    source={source}
                    onChange={(patch) => updateDraft(draft.id, patch)}
                  />
                </Box>

                <IconButton
                  aria-label={`Remove ${libraryFilterFieldTitle(field, availableFields)} filter`}
                  onClick={() => setDrafts((current) =>
                    current.filter((candidate) => candidate.id !== draft.id))}
                  sx={{ alignSelf: { xs: "flex-end", md: "center" } }}
                >
                  <DeleteOutlineRounded />
                </IconButton>
              </Box>
            );
          })}

          <Button
            startIcon={<AddRounded />}
            disabled={drafts.length >= MAX_LIBRARY_FILTERS}
            onClick={() => {
              const draft = createDraft(availableFields, fieldTypes);
              if (draft) setDrafts((current) => [...current, draft]);
            }}
            sx={{ mt: 2 }}
          >
            Add filter
          </Button>
      </>
    </AppDialog>
  );
}
