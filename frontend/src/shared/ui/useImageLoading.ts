import { keyframes } from "@mui/material/styles";
import { useCallback, useRef, useState } from "react";

type ImageStatus = "loading" | "loaded" | "missing";
const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

/** Image state belongs to its source, including cached images and stale events. */
export function useImageLoading(src: string | null | undefined) {
  const current = useRef(src);
  current.current = src;
  const [result, setResult] = useState<{
    src: string;
    status: ImageStatus;
  } | null>(null);
  const settle = useCallback(
    (status: ImageStatus) => {
      if (src && current.current === src)
        setResult((previous) =>
          previous?.src === src && previous.status === status
            ? previous
            : { src, status },
        );
    },
    [src],
  );
  const ref = useCallback(
    (image: HTMLImageElement | null) => {
      if (image?.complete && image.naturalWidth > 0) settle("loaded");
    },
    [settle],
  );
  return {
    status: !src ? "missing" : result?.src === src ? result.status : "loading",
    imageProps: {
      ref,
      onLoad: () => settle("loaded"),
      onError: () => settle("missing"),
    },
  };
}

export function imageFadeSx(loaded: boolean) {
  return {
    opacity: loaded ? 1 : 0,
    animation: loaded ? `${fadeIn} 500ms ease-out` : "none",
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  };
}
