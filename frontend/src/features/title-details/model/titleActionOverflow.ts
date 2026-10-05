export const TITLE_ACTION_PRIORITY = [
  "watchlist",
  "watched",
  "rating",
  "download",
  "edit",
  "match",
] as const;
export type TitleActionID = (typeof TITLE_ACTION_PRIORITY)[number];

export function titleActionOverflow({
  width,
  playWidth,
  menuWidth,
  gap,
  actions,
  hasMenuActions,
}: {
  width: number;
  playWidth: number;
  menuWidth: number;
  gap: number;
  actions: Partial<Record<TitleActionID, number>>;
  hasMenuActions: boolean;
}): TitleActionID[] {
  const available = TITLE_ACTION_PRIORITY.filter(
    (id) => (actions[id] ?? 0) > 0,
  );
  const hidden: TitleActionID[] = [];
  const visible = [...available];
  const requiredWidth = () => {
    const menu = hasMenuActions || hidden.length > 0;
    return (
      playWidth +
      (menu ? menuWidth + gap : 0) +
      visible.reduce((sum, id) => sum + actions[id]! + gap, 0)
    );
  };
  while (visible.length && requiredWidth() > width) hidden.push(visible.pop()!);
  return hidden;
}
