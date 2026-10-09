import type { ToolbarMeasurements } from "shared/lib/useToolbarOverflow";

export const LIBRARY_NAVIGATION_SETTING = "LIBRARY_NAVIGATION";

export type NavigationLibrary = Pick<
  Plex.LibarySection,
  "key" | "uuid" | "title" | "type"
>;

export interface LibraryNavigationPreference {
  order: string[];
  pinned: string[];
  iconsOnly?: boolean;
}

export function isLibraryRouteActive(pathname: string, libraryKey: string) {
  const route = `/browse/${libraryKey}`;
  return pathname === route || pathname.startsWith(`${route}/`);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function parseLibraryNavigation(
  value: string | undefined,
): LibraryNavigationPreference | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<LibraryNavigationPreference>;
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.pinned))
      return null;
    if (
      !parsed.order.every((id) => typeof id === "string") ||
      !parsed.pinned.every((id) => typeof id === "string")
    )
      return null;
    return {
      order: unique(parsed.order),
      pinned: unique(parsed.pinned),
      iconsOnly: parsed.iconsOnly === true,
    };
  } catch {
    return null;
  }
}

export function normalizeLibraryNavigation(
  libraries: NavigationLibrary[],
  settings: Record<string, string>,
) {
  const ids = libraries.map((library) => library.uuid);
  const available = new Set(ids);
  const stored = parseLibraryNavigation(settings[LIBRARY_NAVIGATION_SETTING]);
  const storedOrder = stored?.order.filter((id) => available.has(id)) || [];
  const newIds = ids.filter((id) => !storedOrder.includes(id));
  const order = [...storedOrder, ...newIds];
  const pinned = unique([
    ...(stored?.pinned.filter((id) => available.has(id)) || ids),
    ...(stored ? newIds : []),
  ]);
  const byId = new Map(libraries.map((library) => [library.uuid, library]));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((library): library is NavigationLibrary => Boolean(library));
  const pinnedSet = new Set(pinned);

  return {
    preference: {
      order,
      pinned,
      iconsOnly: stored?.iconsOnly ?? false,
    } satisfies LibraryNavigationPreference,
    ordered,
    pinned: ordered.filter((library) => pinnedSet.has(library.uuid)),
    unpinned: ordered.filter((library) => !pinnedSet.has(library.uuid)),
  };
}

export function serializeLibraryNavigation(value: LibraryNavigationPreference) {
  return JSON.stringify({
    order: unique(value.order),
    pinned: unique(value.pinned),
    ...(value.iconsOnly && { iconsOnly: true }),
  });
}

/** Preserve pin order and reserve the selector only when some libraries need it. */
export function libraryNavigationOverflow(
  { width, gap, items }: ToolbarMeasurements,
  keys: readonly string[],
  hasUnpinned: boolean,
) {
  let visible = keys.length;
  let linksWidth = keys.reduce((sum, key) => sum + items[key], 0);
  const requiredWidth = () => {
    const menu = hasUnpinned || visible < keys.length;
    const count = visible + Number(menu);
    return linksWidth + (menu ? items.more : 0) + Math.max(0, count - 1) * gap;
  };
  while (visible > 0 && requiredWidth() > width)
    linksWidth -= items[keys[--visible]];
  return keys.slice(visible);
}
