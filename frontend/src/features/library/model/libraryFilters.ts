import type {
  LibraryFilterClause,
  LibraryFilterMode,
  LibraryFilterOperator,
} from "@nevu/contracts";

const LIBRARY_FILTER_PARAM = "filter";
export const LIBRARY_FILTER_MODE_PARAM = "match";
export const MAX_LIBRARY_FILTERS = 16;

const operators = new Set<LibraryFilterOperator>([
  "=", "!=", "==", "!==", "<=", ">=", "<<=", ">>=",
]);
const fieldExpression = /^[A-Za-z][A-Za-z0-9_.]{0,95}$/;

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export interface LibraryFilterValueOption {
  value: string;
  label: string;
}

export function isLibraryFilterClause(value: unknown): value is LibraryFilterClause {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.field === "string" &&
    fieldExpression.test(candidate.field) &&
    typeof candidate.operator === "string" &&
    operators.has(candidate.operator as LibraryFilterOperator) &&
    typeof candidate.value === "string" &&
    Boolean(candidate.value.trim()) &&
    candidate.value.length <= 256 &&
    !hasControlCharacters(candidate.value) &&
    (candidate.valueLabel === undefined ||
      (typeof candidate.valueLabel === "string" &&
        candidate.valueLabel.length <= 256 &&
        !hasControlCharacters(candidate.valueLabel)));
}

export function normalizeLibraryFilters(filters: readonly LibraryFilterClause[]) {
  const seen = new Set<string>();
  return filters
    .filter(isLibraryFilterClause)
    .filter((filter) => {
      const key = JSON.stringify([filter.field, filter.operator, filter.value]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_LIBRARY_FILTERS)
    .sort((left, right) =>
      left.field.localeCompare(right.field) ||
      left.operator.localeCompare(right.operator) ||
      left.value.localeCompare(right.value),
    );
}

export function readLibraryFilters(params: URLSearchParams) {
  return normalizeLibraryFilters(
    params.getAll(LIBRARY_FILTER_PARAM).flatMap((serialized) => {
      try {
        const [field, operator, value, valueLabel] = JSON.parse(serialized);
        const filter = {
          field,
          operator,
          value,
          ...(typeof valueLabel === "string" && { valueLabel }),
        };
        return isLibraryFilterClause(filter) ? [filter] : [];
      } catch {
        return [];
      }
    }),
  );
}

export function readLibraryFilterMode(params: URLSearchParams): LibraryFilterMode {
  return params.get(LIBRARY_FILTER_MODE_PARAM) === "any" ? "or" : "and";
}

export function writeLibraryFilterMode(
  params: URLSearchParams,
  mode: LibraryFilterMode,
) {
  params.set(LIBRARY_FILTER_MODE_PARAM, mode === "or" ? "any" : "all");
}

export function writeLibraryFilters(
  params: URLSearchParams,
  filters: readonly LibraryFilterClause[],
) {
  params.delete(LIBRARY_FILTER_PARAM);
  for (const { field, operator, value, valueLabel } of normalizeLibraryFilters(filters))
    params.append(
      LIBRARY_FILTER_PARAM,
      JSON.stringify([field, operator, value, valueLabel || undefined]),
    );
}

export function libraryFilterOperators(
  field: Plex.Field | undefined,
  fieldTypes: readonly Plex.FieldType[],
) {
  if (!field) return [];
  return fieldTypes.find((entry) => entry.type === field.type)?.Operator || [];
}

export function libraryFilterIsOperator(
  field: Plex.Field | undefined,
  fieldTypes: readonly Plex.FieldType[],
) {
  const available = libraryFilterOperators(field, fieldTypes);
  return available.find((operator) => operator.title.trim().toLowerCase() === "is") ||
    available.find((operator) => operator.key === "=" || operator.key === "==");
}

export function libraryFilterFields(types: readonly Plex.Type[]) {
  const fields = new Map<string, Plex.Field>();
  for (const type of types)
    for (const field of type.Field || [])
      if (!fields.has(field.key)) fields.set(field.key, field);
  return [...fields.values()];
}

export function libraryFiltersForType(
  filters: readonly LibraryFilterClause[],
  fields: readonly Plex.Field[],
  fieldTypes: readonly Plex.FieldType[],
) {
  return normalizeLibraryFilters(filters.filter((filter) => {
    const field = fields.find((candidate) => candidate.key === filter.field);
    return libraryFilterOperators(field, fieldTypes)
      .some((operator) => operator.key === filter.operator);
  }));
}

export function libraryFilterSource(
  field: Plex.Field | undefined,
  types: readonly Plex.Type[],
) {
  if (!field) return undefined;
  const sourceTypes = types.filter((type) => type.Filter?.length || type.Field?.length);
  for (const type of sourceTypes) {
    const source = type.Filter?.find((filter) =>
      filter.filter === field.key ||
      field.key === `${type.type}.${filter.filter}` ||
      (sourceTypes.length === 1 && field.key === filter.filter),
    );
    if (source) return source;
  }
  return undefined;
}

export function libraryFilterFieldTitle(
  field: Plex.Field,
  fields: readonly Plex.Field[],
) {
  if (fields.filter((candidate) => candidate.title === field.title).length < 2)
    return field.title;
  const scope = field.key.includes(".") ? field.key.split(".")[0] : undefined;
  return scope
    ? `${scope.charAt(0).toUpperCase()}${scope.slice(1)} - ${field.title}`
    : field.title;
}
