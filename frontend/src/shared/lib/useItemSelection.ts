import { useEffect, useState } from "react";

interface Selection {
  scope: string;
  active: boolean;
  ids: ReadonlySet<string>;
}

/** UI selection owns IDs only. The caller defines the catalog/parent scope;
 * toggleAll applies to the supplied IDs, including when only a page is loaded. */
export function useItemSelection(scope: string) {
  const empty = (): Selection => ({ scope, active: false, ids: new Set() });
  const [stored, setStored] = useState<Selection>(empty);
  const selection = stored.scope === scope ? stored : empty();
  useEffect(() => {
    setStored({ scope, active: false, ids: new Set() });
  }, [scope]);
  const update = (change: (current: Selection) => Selection) =>
    setStored((current) => change(current.scope === scope ? current : empty()));

  return {
    active: selection.active,
    ids: selection.ids,
    start: (id: string) =>
      update(() => ({ scope, active: true, ids: new Set([id]) })),
    clear: () => update(empty),
    toggle: (id: string) =>
      update((current) => {
        const ids = new Set(current.ids);
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return { ...current, active: true, ids };
      }),
    toggleAll: (values: readonly string[]) =>
      update((current) => {
        const ids = new Set(current.ids);
        const remove = values.length > 0 && values.every((id) => ids.has(id));
        values.forEach((id) => (remove ? ids.delete(id) : ids.add(id)));
        return { ...current, active: true, ids };
      }),
    retain: (values: readonly string[]) =>
      update((current) => {
        const ids = new Set(values.filter((id) => current.ids.has(id)));
        return ids.size === current.ids.size ? current : { ...current, ids };
      }),
  };
}
