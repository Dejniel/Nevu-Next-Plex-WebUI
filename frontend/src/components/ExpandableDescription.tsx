import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import React, { useEffect, useState } from "react";

const DESKTOP_BREAKPOINT = "(min-width: 600px)";

function ExpandableDescription({
  text,
  lines = 4,
  minLines = 3,
  boundaryRef,
  color = "text.secondary",
}: {
  text?: string;
  lines?: number;
  minLines?: number;
  boundaryRef?: React.RefObject<HTMLDivElement | null>;
  color?: string;
}) {
  const textRef = React.useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [maxLines, setMaxLines] = useState(lines);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    let frame = 0;

    const measure = () => {
      let nextLines = lines;
      const boundary = boundaryRef?.current;

      if (boundary && window.matchMedia(DESKTOP_BREAKPOINT).matches) {
        const lineHeight = Number.parseFloat(
          window.getComputedStyle(element).lineHeight,
        );
        const availableHeight =
          boundary.getBoundingClientRect().bottom -
          element.getBoundingClientRect().top;

        if (Number.isFinite(lineHeight) && lineHeight > 0) {
          nextLines = Math.max(minLines, Math.floor(availableHeight / lineHeight));
        }
      }

      setMaxLines(nextLines);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setTruncated(
          !expanded && element.scrollHeight > element.clientHeight + 1,
        );
      });
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);
    if (boundaryRef?.current) resizeObserver.observe(boundaryRef.current);
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [boundaryRef, expanded, lines, minLines, text]);

  useEffect(() => {
    if (expanded) {
      setTruncated(false);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = textRef.current;
      if (element)
        setTruncated(element.scrollHeight > element.clientHeight + 1);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded, maxLines, text]);

  if (!text) return null;

  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      <Typography
        ref={textRef}
        component="div"
        sx={{
          fontSize: "1rem",
          fontWeight: "normal",
          lineHeight: 1.5,
          maxInlineSize: "100%",
          color,
          ...(expanded
            ? {}
            : {
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: "vertical",
              }),
        }}
      >
        {text}
      </Typography>

      {truncated && !expanded && (
        <Box
          component="button"
          type="button"
          aria-label="Expand description"
          onClick={() => setExpanded(true)}
          sx={{
            position: "absolute",
            right: 0,
            bottom: 0,
            height: "1.5em",
            border: 0,
            pl: 3,
            pr: 0,
            py: 0,
            font: "inherit",
            lineHeight: 1.5,
            color: "primary.main",
            background: (theme) =>
              `linear-gradient(90deg, ${alpha(
                theme.palette.background.default,
                0,
              )}, ${theme.palette.background.default} 28%, ${
                theme.palette.background.default
              } 100%)`,
            cursor: "pointer",
            "&:hover": { color: "primary.light" },
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: 2,
            },
          }}
        >
          [expand]
        </Box>
      )}
    </Box>
  );
}

export default ExpandableDescription;
