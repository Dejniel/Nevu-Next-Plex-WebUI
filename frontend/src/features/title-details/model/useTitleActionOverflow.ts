import { useLayoutEffect, useRef, useState } from "react";
import { titleActionOverflow, type TitleActionID } from "./titleActionOverflow";

export function useTitleActionOverflow(hasMenuActions: boolean) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const moveFocusToMenu = useRef(false);
  const [overflow, setOverflow] = useState<TitleActionID[]>([]);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const elements = Array.from(
      toolbar.querySelectorAll<HTMLElement>("[data-title-action]"),
    );
    let frame = 0;
    const measure = () => {
      const widths = Object.fromEntries(
        elements.map((element) => [
          element.dataset.titleAction,
          Math.ceil(element.getBoundingClientRect().width),
        ]),
      );
      const next = titleActionOverflow({
        width: toolbar.clientWidth,
        playWidth: widths.play,
        menuWidth: widths.more,
        gap: Number.parseFloat(getComputedStyle(toolbar).columnGap) || 0,
        actions: widths,
        hasMenuActions,
      });
      const active = document.activeElement?.closest<HTMLElement>(
        "[data-title-action]",
      );
      if (
        active &&
        toolbar.contains(active) &&
        next.includes(active.dataset.titleAction as TitleActionID)
      )
        moveFocusToMenu.current = true;
      setOverflow((current) =>
        current.join() === next.join() ? current : next,
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
  }, [hasMenuActions]);

  useLayoutEffect(() => {
    if (!moveFocusToMenu.current) return;
    toolbarRef.current
      ?.querySelector<HTMLElement>('[data-title-action="more"] button')
      ?.focus();
    moveFocusToMenu.current = false;
  }, [overflow]);

  return { toolbarRef, overflow };
}
