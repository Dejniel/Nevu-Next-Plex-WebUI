import { useCallback } from "react";
import {
  useToolbarOverflow,
  type ToolbarMeasurements,
} from "shared/lib/useToolbarOverflow";
import { titleActionOverflow } from "./titleActionOverflow";

export function useTitleActionOverflow(hasMenuActions: boolean) {
  const decide = useCallback(
    ({ width, gap, items }: ToolbarMeasurements) =>
      titleActionOverflow({
        width,
        gap,
        playWidth: items.play,
        menuWidth: items.more,
        actions: items,
        hasMenuActions,
      }),
    [hasMenuActions],
  );
  return useToolbarOverflow(decide);
}
