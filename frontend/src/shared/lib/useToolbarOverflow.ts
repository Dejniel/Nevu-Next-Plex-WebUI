import { useLayoutEffect, useRef, useState } from "react";

export interface ToolbarMeasurements {
  width: number;
  gap: number;
  items: Record<string, number>;
}

/** Measure mounted slots, including hidden ones, without losing their natural widths. */
export function useToolbarOverflow<T extends string>(
  decide: (measurements: ToolbarMeasurements) => T[],
) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const moveFocusToMenu = useRef(false);
  const [overflow, setOverflow] = useState<T[]>([]);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const elements = Array.from(
      toolbar.querySelectorAll<HTMLElement>("[data-overflow-item]"),
    );
    let frame = 0;
    const measure = () => {
      const items = Object.fromEntries(
        elements.map((element) => [
          element.dataset.overflowItem!,
          Math.ceil(element.getBoundingClientRect().width),
        ]),
      );
      const next = decide({
        width: toolbar.clientWidth,
        gap: Number.parseFloat(getComputedStyle(toolbar).columnGap) || 0,
        items,
      });
      const active = document.activeElement?.closest<HTMLElement>(
        "[data-overflow-item]",
      );
      if (
        active &&
        toolbar.contains(active) &&
        next.some((id) => id === active.dataset.overflowItem)
      )
        moveFocusToMenu.current = true;
      setOverflow((current) =>
        current.length === next.length &&
        current.every((id, index) => id === next[index])
          ? current
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(toolbar);
    elements.forEach((element) => observer.observe(element));
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [decide]);

  useLayoutEffect(() => {
    if (!moveFocusToMenu.current) return;
    toolbarRef.current
      ?.querySelector<HTMLElement>('[data-overflow-item="more"] button')
      ?.focus();
    moveFocusToMenu.current = false;
  }, [overflow]);

  return { toolbarRef, overflow };
}
