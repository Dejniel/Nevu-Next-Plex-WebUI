import {
  ArrowBackIosNewRounded,
  ArrowForwardIosRounded,
} from "@mui/icons-material";
import { Box, IconButton, Skeleton, Typography } from "@mui/material";
import { useLayoutEffect, useRef, useState } from "react";
import { Link, type To } from "react-router-dom";
import {
  mediaCardAspectRatio,
  mediaCardWidth,
  type MediaArtworkLayout,
  type MediaItemData,
} from "entities/media/model";
import ActionableMediaCard from "./ActionableMediaCard";

const GAP = 10;

export interface MediaShelfProps {
  title: string;
  data: readonly MediaItemData[];
  loading?: boolean;
  browseTo?: To | null;
  plexTvSource?: boolean;
  layout?: MediaArtworkLayout;
  cardSize?: number;
  gutter?: string | number;
  headingVariant?: "h4" | "h5";
}

/** Present already-owned media; geometry and navigation belong to this container. */
export function MediaShelf({
  title,
  data,
  loading = false,
  browseTo,
  plexTvSource,
  layout = "landscape",
  cardSize,
  gutter = "2.5vw",
  headingVariant = "h4",
}: MediaShelfProps) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [anchor, setAnchor] = useState<{ index: number; key?: string }>({
    index: 0,
  });
  const touch = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!viewport) {
      setWidth(0);
      return;
    }
    const measure = () => setWidth(viewport.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);

  const columns = Math.min(
    10,
    Math.max(
      1,
      Math.floor((width + GAP) / (mediaCardWidth(layout, cardSize) + GAP)),
    ),
  );
  const pending = loading || width === 0;
  const count = pending ? columns : data.length;
  const pages = Math.max(1, Math.ceil(count / columns));
  const anchored = anchor.key
    ? data.findIndex((item) => item.ratingKey === anchor.key)
    : -1;
  const page = Math.min(
    Math.floor((anchored < 0 ? anchor.index : anchored) / columns),
    pages - 1,
  );
  const start = page * columns;
  const cardWidth = Math.max(1, (width - GAP * (columns - 1)) / columns);
  const previousPage = useRef(page);
  const animate = Math.abs(page - previousPage.current) <= 1;
  useLayoutEffect(() => {
    previousPage.current = page;
  }, [page]);
  const changePage = (step: number) => {
    if (pages > 1) {
      const index = ((page + step + pages) % pages) * columns;
      setAnchor({ index, key: data[index]?.ratingKey });
    }
  };

  if (!loading && data.length === 0) return null;

  return (
    <Box
      component="section"
      aria-label={title}
      aria-roledescription="carousel"
      aria-busy={pending}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          changePage(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
      sx={{
        width: "100%",
        minWidth: 0,
        px: gutter,
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          mb: 1,
        }}
      >
        <Typography
          component="h2"
          variant={headingVariant}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            minWidth: 0,
            fontSize:
              headingVariant === "h4"
                ? { xs: "1.3rem", sm: "1.6rem", md: "2rem" }
                : undefined,
            fontWeight: 700,
            overflowWrap: "anywhere",
          }}
        >
          {browseTo ? (
            <Box
              component={Link}
              to={browseTo}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                color: "inherit",
                textDecoration: "none",
                "&:hover": { color: "primary.main" },
              }}
            >
              {title}
              <ArrowForwardIosRounded sx={{ fontSize: 16, flexShrink: 0 }} />
            </Box>
          ) : (
            title
          )}
        </Typography>
        {!pending && pages > 1 && (
          <Box
            role="group"
            aria-label={`${title} pages`}
            sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            <IconButton
              aria-label={`Previous ${title} page`}
              onClick={() => changePage(-1)}
              size="small"
            >
              <ArrowBackIosNewRounded fontSize="small" />
            </IconButton>
            <Typography
              variant="caption"
              aria-live="polite"
              aria-atomic="true"
              aria-label={`Page ${page + 1} of ${pages}`}
              sx={{
                minWidth: 40,
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {page + 1} / {pages}
            </Typography>
            <IconButton
              aria-label={`Next ${title} page`}
              onClick={() => changePage(1)}
              size="small"
            >
              <ArrowForwardIosRounded fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>
      <Box
        ref={setViewport}
        role="group"
        aria-label={`${title} items`}
        sx={{
          width: "100%",
          overflow: "hidden",
          py: 1,
          touchAction: "pan-y pinch-zoom",
        }}
        onTouchStart={(event) => {
          const point = event.touches.length === 1 ? event.touches[0] : null;
          touch.current = point ? { x: point.clientX, y: point.clientY } : null;
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
        onTouchEnd={(event) => {
          const from = touch.current;
          touch.current = null;
          const to = event.changedTouches[0];
          if (!from || !to) return;
          const dx = from.x - to.clientX;
          if (
            Math.abs(dx) >= 50 &&
            Math.abs(dx) > Math.abs(from.y - to.clientY)
          ) {
            event.preventDefault();
            changePage(dx > 0 ? 1 : -1);
          }
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: `${GAP}px`,
            transform: `translateX(calc(-${page} * (100% + ${GAP}px)))`,
            transition: animate ? "transform 350ms ease" : "none",
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          }}
        >
          {Array.from({ length: count }, (_, index) => {
            const visible = index >= start && index < start + columns;
            const near =
              index >= start - columns && index < start + columns * 2;
            return (
              <Box
                key={pending ? index : data[index].ratingKey}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}`}
                inert={!visible}
                sx={{
                  flex: `0 0 calc((100% - ${GAP * (columns - 1)}px) / ${columns})`,
                  minWidth: 0,
                }}
              >
                {!pending && near ? (
                  <ActionableMediaCard
                    item={data[index]}
                    layout={layout}
                    PlexTvSource={plexTvSource}
                    imageSizes={`${Math.ceil(cardWidth)}px`}
                  />
                ) : (
                  <Box aria-hidden="true">
                    <Skeleton
                      variant="rounded"
                      animation={pending ? "wave" : false}
                      sx={{
                        width: "100%",
                        height: "auto",
                        aspectRatio: mediaCardAspectRatio(layout),
                      }}
                    />
                    <Box sx={{ height: 60 }} />
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
