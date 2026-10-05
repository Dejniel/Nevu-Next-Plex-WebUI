import type { QueryClient } from "@tanstack/react-query";
import {
  changedMediaFields,
  type LibraryItemUpdateDto,
  type LibraryPageDto,
} from "@nevu/contracts";
import type { MediaChange, ReconciledMediaChange } from "entities/media/model";
import {
  decideLibrarySynchronization,
  libraryDependenciesUnaffected,
} from "./librarySynchronization";
import type { LibraryQuery } from "./libraryQuery";
import type { libraryResultQueryKey } from "./libraryQuery";

export async function applyLibraryChanges(
  client: QueryClient,
  changes: readonly ReconciledMediaChange[],
) {
  if (!changes.length) return;
  const scope = changes[0].change;
  const windows = client
    .getQueryCache()
    .findAll({ queryKey: ["library", scope.serverId, scope.profileKey] })
    .filter((query) => query.queryKey[4] === "window");
  const refreshes: Promise<void>[] = [];
  for (const window of windows) {
    const parameters = window.queryKey[3] as ReturnType<typeof libraryResultQueryKey>[3];
    const query: LibraryQuery = {
      ...parameters,
      profileKey: scope.profileKey,
      type: parameters.type === "any" ? undefined : parameters.type,
      filterExpression: parameters.filterExpression ?? undefined,
    };
    const prefix = window.queryKey.slice(0, 4);
    const pages = client.getQueryCache().findAll({ queryKey: [...prefix, "page"] });
    const published = (window.state.data as { revision: number }).revision;
    const beforeItems = pages
      .filter((page) => page.queryKey[5] === published)
      .flatMap((page) => (page.state.data as LibraryPageDto | undefined)?.items ?? []);
    const patches = new Map<string, NonNullable<LibraryItemUpdateDto["item"]>>();
    let refresh = false;
    for (const { change, update } of changes) {
      const before =
        update?.item && beforeItems.find((item) => item.ratingKey === update.item!.ratingKey);
      const fields = before && update?.item ? changedMediaFields(before, update.item) : [];
      // Equal cards do not prove that omitted metadata used by an opaque predicate is unchanged.
      const comparable = fields.length > 0 || libraryDependenciesUnaffected(query, fields);
      const effect: MediaChange =
        update?.item && before && comparable
          ? {
              ...change,
              kind: "item",
              effect: "metadata",
              id: update.item.ratingKey,
              sectionId: update.sectionId,
              fields,
              parentIds: update.parentIds,
            }
          : change;
      const decision = decideLibrarySynchronization(scope.serverId, query, effect);
      refresh ||= decision === "refresh";
      if (decision === "patch" && update?.item) patches.set(update.item.ratingKey, update.item);
    }
    if (!refresh && !patches.size) continue;
    // Reads started before a confirmed change must not publish over it.
    refresh ||=
      window.state.fetchStatus === "fetching" ||
      pages.some((page) => page.state.fetchStatus === "fetching");
    await client.cancelQueries({ queryKey: prefix });
    if (refresh) {
      // Each affected result refreshes once per batch; inactive offsets belong to the old revision.
      refreshes.push(
        client.invalidateQueries(
          { queryKey: window.queryKey, exact: true, refetchType: "active" },
          { throwOnError: true },
        ),
      );
    } else {
      client.setQueriesData<LibraryPageDto>({ queryKey: [...prefix, "page"] }, (page) =>
        !page
          ? page
          : {
              ...page,
              items: page.items.map((item) => patches.get(item.ratingKey) ?? item),
            },
      );
    }
  }
  await Promise.all(refreshes);
}
