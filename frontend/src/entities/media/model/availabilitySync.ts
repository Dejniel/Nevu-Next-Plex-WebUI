import type { QueryClient } from "@tanstack/react-query";
import type { availabilityQueryOptions } from "./availabilityQuery";
import { affectedMediaParents, type ReconciledMediaChange } from "./mediaChanges";

export async function applyAvailabilityChanges(
  client: QueryClient,
  changes: readonly ReconciledMediaChange[],
) {
  if (!changes.length) return;
  const scope = changes[0].change;
  const reads: Promise<void>[] = [];
  for (const query of client.getQueryCache().findAll({
    queryKey: ["availability", scope.serverId, scope.profileKey],
  })) {
    const [, , , requested] = query.queryKey as ReturnType<
      typeof availabilityQueryOptions
    >["queryKey"];
    const previous = query.state.data as Plex.Metadata[] | undefined;
    let items = previous;
    let refresh = false;
    let patched = false;
    for (const entry of changes) {
      const { change, update, parentScopeUnknown } = entry;
      if (change.kind === "list") continue;
      if (change.kind === "recovery" || !update || change.kind !== "item" || !change.id) {
        refresh = true;
        continue;
      }
      const old = previous?.filter((item) => item.ratingKey === change.id) ?? [];
      const matches = old.length || (update.item?.guid && requested.includes(update.item.guid));
      const parent = affectedMediaParents(entry).some((id) =>
        previous?.some((item) => item.ratingKey === id),
      );
      if (parent || (parentScopeUnknown && previous?.some((item) =>
        (item.type === "show" || item.type === "season") &&
        (!change.sectionId || String(item.librarySectionID) === change.sectionId),
      ))) refresh = true;
      if (!matches) {
        if (!update.item && !previous) refresh = true;
        continue;
      }
      const metadata = update.metadata as Plex.Metadata | undefined;
      if (update.item && !metadata) {
        refresh = true;
        continue;
      }
      if (!items) {
        refresh = true;
        continue;
      }
      items = items.filter((item) => item.ratingKey !== change.id);
      if (metadata && requested.includes(metadata.guid) && metadata.librarySectionID > 0)
        items = [...items, metadata];
      patched = true;
    }
    if (!refresh && !patched) continue;
    await client.cancelQueries({ queryKey: query.queryKey, exact: true });
    if (patched) client.setQueryData(query.queryKey, items);
    if (refresh)
      reads.push(
        client.invalidateQueries(
          { queryKey: query.queryKey, exact: true, refetchType: "active" },
          { throwOnError: true },
        ),
      );
  }
  await Promise.all(reads);
}
