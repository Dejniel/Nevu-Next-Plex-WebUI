import { useLayoutEffect, useRef, type RefObject } from "react";
import { WebVTT } from "videojs-vtt.js";
import "./VideoCaptions.css";

type RenderedCue = VTTCue & { displayState?: HTMLElement };

/** Keep timed text independent of the video's transport and custom controls. */
export default function VideoCaptions({
  videoRef,
  bottomInset,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  bottomInset: number;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    let rendered: RenderedCue[] = [];
    let frame = 0;
    const clear = () => {
      rendered.forEach((cue) => delete cue.displayState);
      rendered = [];
      overlay.replaceChildren();
    };
    const render = () => {
      clear();
      const bounds = overlay.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      overlay.style.setProperty(
        "--video-caption-font-size",
        `${Math.max(16, Math.min(40, Math.min(bounds.width, bounds.height) * 0.05))}px`,
      );
      rendered = Array.from(video.querySelectorAll("track")).flatMap(
        (element) =>
          Array.from(element.track.activeCues ?? []) as RenderedCue[],
      );
      WebVTT.processCues(window, rendered, overlay);
      if (bottomInset <= 0) return;
      const automatic = rendered.filter(
        (cue) => cue.line === "auto" && !cue.vertical && !cue.region,
      );
      const boxes = automatic.flatMap((cue) =>
        cue.displayState ? [cue.displayState.getBoundingClientRect()] : [],
      );
      if (!boxes.length) return;
      // Move simultaneous default cues together, retaining their relative layout.
      // Author-positioned signs and vertical text retain their supplied positions.
      const distance = Math.min(
        Math.max(
          0,
          Math.max(...boxes.map((box) => box.bottom)) -
            (bounds.bottom - bottomInset - 16),
        ),
        Math.max(0, Math.min(...boxes.map((box) => box.top)) - bounds.top - 8),
      );
      automatic.forEach((cue) => {
        if (cue.displayState)
          cue.displayState.style.transform = `translateY(-${distance}px)`;
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    video.addEventListener("cuechange", schedule, true);
    video.addEventListener("load", schedule, true);
    video.addEventListener("loadedmetadata", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(overlay);
    const children = new MutationObserver(schedule);
    children.observe(video, { childList: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      children.disconnect();
      video.removeEventListener("cuechange", schedule, true);
      video.removeEventListener("load", schedule, true);
      video.removeEventListener("loadedmetadata", schedule);
      clear();
    };
  }, [videoRef, bottomInset]);

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      data-video-captions
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
      }}
    />
  );
}
