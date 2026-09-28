import type {
  LibraryFilterClause,
  LibraryFilterExpression,
  LibraryFilterMode,
} from "@nevu/contracts";

function expressionKey(expression: LibraryFilterExpression) {
  return JSON.stringify(expression);
}

function compareExpressionKeys(left: LibraryFilterExpression, right: LibraryFilterExpression) {
  const leftKey = expressionKey(left);
  const rightKey = expressionKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

export function normalizeLibraryFilterExpression(
  expression: LibraryFilterExpression | undefined,
): LibraryFilterExpression | undefined {
  if (!expression) return undefined;
  if (expression.kind === "clause") {
    const { field, operator, value } = expression;
    return { kind: "clause", field, operator, value };
  }

  const normalized = expression.children.flatMap((child) => {
    const next = normalizeLibraryFilterExpression(child);
    if (!next) return [];
    return next.kind === "group" && next.mode === expression.mode
      ? next.children
      : [next];
  });
  const unique = new Map(normalized.map((child) => [expressionKey(child), child]));
  const children = [...unique.values()].sort(compareExpressionKeys);
  if (!children.length) return undefined;
  if (children.length === 1) return children[0];
  return { kind: "group", mode: expression.mode, children };
}

export function createLibraryFilterExpression(
  mode: LibraryFilterMode,
  filters: readonly LibraryFilterClause[],
) {
  return normalizeLibraryFilterExpression({
    kind: "group",
    mode,
    children: filters.map(({ field, operator, value }) => ({
      kind: "clause",
      field,
      operator,
      value,
    })),
  });
}

export function libraryFilterExpressionKey(
  expression: LibraryFilterExpression | undefined,
) {
  return JSON.stringify(normalizeLibraryFilterExpression(expression) || null);
}
