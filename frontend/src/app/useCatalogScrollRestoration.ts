import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** History positions are UI state, independent of cached server responses. */
export function useCatalogScrollRestoration() {
  const location = useLocation();
  const navigation = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const previousPath = useRef(location.pathname);
  useLayoutEffect(() => {
    const saved = positions.current;
    const changedPath = previousPath.current !== location.pathname;
    previousPath.current = location.pathname;
    const target = navigation === "POP" ? saved.get(location.key) : undefined;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    if (
      location.pathname.startsWith("/browse/") &&
      (changedPath || target !== undefined)
    ) {
      const restore = () => {
        window.scrollTo({ top: target ?? 0, behavior: "instant" });
        if (target === undefined || window.scrollY >= target - 1)
          observer?.disconnect();
      };
      if (target !== undefined) {
        observer = new ResizeObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(restore);
        });
        observer.observe(document.body);
      }
      restore();
    }
    let lastScroll = window.scrollY;
    const remember = () => {
      lastScroll = window.scrollY;
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => {
      saved.set(location.key, lastScroll);
      window.removeEventListener("scroll", remember);
      if (saved.size > 100) saved.delete(saved.keys().next().value!);
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [location.key, location.pathname, navigation]);
}
