import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import {
  ChevronLeftRounded,
  ChevronRightRounded,
  CloseRounded,
  FullscreenRounded,
  InfoOutlined,
  PauseRounded,
  PlayArrowRounded,
  ViewCarouselRounded,
  ZoomInRounded,
  ZoomOutRounded,
} from "@mui/icons-material";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useActiveServerScope } from "features/session/model";
import {
  getTranscodeImageURL,
  mediaArtworkPath,
  mediaMetadataQueryOptions,
  type MediaItemData,
} from "entities/media/model";
import { serverQueryClient } from "shared/api/queryClient";
import { MediaItemMenu } from "features/media-actions/public";
import { overlayContainer } from "shared/lib/overlayContainer";
import { useImageLoading, imageFadeSx } from "shared/ui/useImageLoading";
import { QueryErrorAlert } from "shared/ui/QueryErrorAlert";
import type { CollectionRange } from "shared/ui/CollectionViewport";
import { adjacentPhoto, photoIndex } from "../model/photos";

export function PhotoViewer({
  range,
  renderMenuItems,
}: {
  range: Pick<CollectionRange<MediaItemData>, "items" | "errors" | "retry">;
  renderMenuItems?: (position: number, close: () => void) => React.ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const id = params.get("photo") ?? "";
  const index = photoIndex(params.get("photoIndex"));
  const scope = useActiveServerScope();
  const metadata = useQuery(
    { ...mediaMetadataQueryOptions(scope, id), enabled: Boolean(id) },
    serverQueryClient,
  );
  const position = index ?? 0;
  const [zoom, setZoom] = useState(1);
  const [info, setInfo] = useState(false);
  const [filmstrip, setFilmstrip] = useState(false);
  const [slideshow, setSlideshow] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const imageViewport = useRef<HTMLDivElement>(null);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const item = metadata.data;
  const previousEntry = adjacentPhoto(range.items, id, index, -1);
  const nextEntry = adjacentPhoto(range.items, id, index, 1);
  const previous = previousEntry?.[1];
  const next = nextEntry?.[1];
  const openAt = (target: number) => {
    const photo = range.items.get(target);
    if (photo?.type !== "photo") return;
    const values = new URLSearchParams(params);
    values.set("photo", photo.ratingKey);
    values.set("photoIndex", String(target));
    setParams(values, { replace: true, state: location.state });
  };
  const close = () => {
    if (location.state?.photoPreview) navigate(-1);
    else {
      const values = new URLSearchParams(params);
      values.delete("photo");
      values.delete("photoIndex");
      setParams(values, { replace: true });
    }
  };
  const callbacks = useRef({
    close,
    openAt,
    previous,
    next,
    position,
    previousIndex: previousEntry?.[0],
    nextIndex: nextEntry?.[0],
    zoom,
  });
  callbacks.current = {
    close,
    openAt,
    previous,
    next,
    position,
    previousIndex: previousEntry?.[0],
    nextIndex: nextEntry?.[0],
    zoom,
  };
  useEffect(() => {
    setZoom(1);
  }, [id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA"].includes(event.target.tagName)
      )
        return;
      const current = callbacks.current;
      if (event.key === "ArrowLeft" && current.previous) {
        event.preventDefault();
        current.openAt(current.previousIndex!);
      }
      if (event.key === "ArrowRight" && current.next) {
        event.preventDefault();
        current.openAt(current.nextIndex!);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!slideshow) return;
    const timer = window.setInterval(() => {
      const current = callbacks.current;
      if (current.next) current.openAt(current.nextIndex!);
      else setSlideshow(false);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [slideshow]);
  useEffect(() => {
    for (const neighbor of [previous, next]) {
      if (!neighbor) continue;
      const artwork = mediaArtworkPath(neighbor, "landscape");
      if (artwork) {
        const image = new Image();
        image.src = getTranscodeImageURL(artwork, 2560, 2560);
      }
    }
  }, [previous, next]);
  const artwork =
    item &&
    (item.Media?.[0]?.Part?.[0]?.key || mediaArtworkPath(item, "landscape"));
  useEffect(() => {
    const viewport = imageViewport.current;
    if (viewport) {
      viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
      viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
    }
  }, [zoom]);
  const src = artwork
    ? getTranscodeImageURL(
        artwork,
        zoom > 1 ? 4096 : 2560,
        zoom > 1 ? 4096 : 2560,
      )
    : null;
  const { status: imageStatus, imageProps } = useImageLoading(src);
  const failed = imageStatus === "missing";
  const loaded = imageStatus === "loaded";
  return (
    <Dialog
      container={overlayContainer}
      fullScreen
      open
      onClose={close}
      aria-label="Photo viewer"
      slotProps={{
        paper: {
          "aria-label": "Photo viewer",
          sx: { bgcolor: "#08090c", backgroundImage: "none" },
        },
      }}
    >
      <Box
        ref={root}
        sx={{ height: "100%", display: "flex", flexDirection: "column" }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            px: 1,
            py: 0.5,
            flexShrink: 0,
            gap: 0.25,
          }}
        >
          <Typography noWrap sx={{ flex: 1, minWidth: 0 }}>
            {item?.title || "Photo"}
          </Typography>
          <IconButton
            aria-label={zoom > 1 ? "Zoom out" : "Zoom in"}
            onClick={() => setZoom((value) => (value > 1 ? 1 : 2))}
          >
            {zoom > 1 ? <ZoomOutRounded /> : <ZoomInRounded />}
          </IconButton>
          <IconButton
            aria-label={slideshow ? "Pause slideshow" : "Start slideshow"}
            disabled={!next}
            onClick={() => setSlideshow((value) => !value)}
          >
            {slideshow ? <PauseRounded /> : <PlayArrowRounded />}
          </IconButton>
          <IconButton
            aria-label="Photo thumbnails"
            onClick={() => setFilmstrip((value) => !value)}
          >
            <ViewCarouselRounded />
          </IconButton>
          <IconButton
            aria-label="Photo information"
            onClick={() => setInfo((value) => !value)}
          >
            <InfoOutlined />
          </IconButton>
          <IconButton
            aria-label="Fullscreen photo"
            sx={{ display: { xs: "none", sm: "inline-flex" } }}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void root.current?.requestFullscreen?.();
            }}
          >
            <FullscreenRounded />
          </IconButton>
          {item && (
            <MediaItemMenu
              item={item}
              onOpen={() => setSlideshow(false)}
              renderMenuItems={
                index !== null &&
                range.items.get(index)?.ratingKey === id &&
                renderMenuItems
                  ? (close) => renderMenuItems(index, close)
                  : undefined
              }
            />
          )}
          <IconButton aria-label="Close photo" onClick={close}>
            <CloseRounded />
          </IconButton>
        </Stack>
        <Box
          sx={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}
        >
          <Box
            ref={imageViewport}
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: "auto",
              position: "relative",
              display: "flex",
              touchAction: zoom > 1 ? "none" : "pan-y",
              cursor: zoom > 1 ? "grab" : "default",
            }}
            onPointerDown={(event) => {
              if (zoom <= 1) return;
              pan.current = {
                x: event.clientX,
                y: event.clientY,
                left: event.currentTarget.scrollLeft,
                top: event.currentTarget.scrollTop,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = pan.current;
              if (start) {
                event.currentTarget.scrollLeft =
                  start.left - event.clientX + start.x;
                event.currentTarget.scrollTop =
                  start.top - event.clientY + start.y;
              }
            }}
            onPointerUp={() => {
              pan.current = null;
            }}
            onPointerCancel={() => {
              pan.current = null;
            }}
            onTouchStart={(event) => {
              touch.current = {
                x: event.touches[0].clientX,
                y: event.touches[0].clientY,
              };
            }}
            onTouchEnd={(event) => {
              const start = touch.current;
              touch.current = null;
              if (!start || zoom > 1) return;
              const dx = event.changedTouches[0].clientX - start.x,
                dy = event.changedTouches[0].clientY - start.y;
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                if (dx < 0 && next) openAt(nextEntry![0]);
                if (dx > 0 && previous) openAt(previousEntry![0]);
              }
            }}
          >
            {(metadata.isPending || (artwork && !loaded && !failed)) && (
              <CircularProgress sx={{ position: "absolute" }} />
            )}
            <QueryErrorAlert
              error={range.errors.values().next().value}
              hasData={range.items.size > 0}
              onRetry={() => range.retry(range.errors.keys().next().value ?? 0)}
            />
            <QueryErrorAlert
              error={metadata.error}
              hasData={Boolean(item)}
              onRetry={metadata.refetch}
            />
            {item && failed && (
              <Alert severity="warning">This photo could not be loaded.</Alert>
            )}
            {src && !failed && (
              <Box
                component="img"
                key={src}
                src={src}
                alt={item?.title || "Photo"}
                draggable={false}
                {...imageProps}
                sx={{
                  width: zoom > 1 ? "200%" : "100%",
                  height: zoom > 1 ? "200%" : "100%",
                  maxWidth: "none",
                  flexShrink: 0,
                  objectFit: "contain",
                  ...imageFadeSx(loaded),
                }}
              />
            )}
          </Box>
          {info && (
            <Box
              sx={{
                width: { xs: 210, sm: 300 },
                flexShrink: 0,
                p: 2,
                bgcolor: "background.paper",
                overflow: "auto",
                position: { xs: "absolute", sm: "relative" },
                right: 0,
                top: 0,
                bottom: 0,
              }}
            >
              <Typography variant="h6">Information</Typography>
              <Typography sx={{ mt: 2 }}>{item?.title}</Typography>
              <Typography color="text.secondary">
                {item?.originallyAvailableAt || "No date"}
              </Typography>
              {item?.parentTitle && (
                <Typography sx={{ mt: 1 }}>{item.parentTitle}</Typography>
              )}
              {item?.Media?.[0]?.width && item.Media[0].height && (
                <Typography>
                  {item.Media[0].width} × {item.Media[0].height}
                </Typography>
              )}
              {item?.summary && (
                <Typography sx={{ mt: 2 }}>{item.summary}</Typography>
              )}
              {item?.Media?.[0] && (
                <Stack spacing={1} sx={{ mt: 2 }}>
                  {[item.Media[0].make, item.Media[0].model].filter(Boolean)
                    .length > 0 && (
                    <Typography>
                      {[item.Media[0].make, item.Media[0].model]
                        .filter(Boolean)
                        .join(" ")}
                    </Typography>
                  )}
                  {item.Media[0].lens && (
                    <Typography>{item.Media[0].lens}</Typography>
                  )}
                  <Typography>
                    {[
                      item.Media[0].aperture,
                      item.Media[0].exposure,
                      item.Media[0].iso ? `ISO ${item.Media[0].iso}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                </Stack>
              )}
            </Box>
          )}
          <IconButton
            aria-label="Previous photo"
            disabled={!previous}
            onClick={() => openAt(previousEntry![0])}
            sx={{
              position: "absolute",
              left: 8,
              top: "50%",
              bgcolor: "rgba(0,0,0,.4)",
            }}
          >
            <ChevronLeftRounded />
          </IconButton>
          <IconButton
            aria-label="Next photo"
            disabled={!next}
            onClick={() => openAt(nextEntry![0])}
            sx={{
              position: "absolute",
              right: info ? { xs: 218, sm: 308 } : 8,
              top: "50%",
              bgcolor: "rgba(0,0,0,.4)",
            }}
          >
            <ChevronRightRounded />
          </IconButton>
        </Box>
        {filmstrip && (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              justifyContent: "center",
              p: 1,
              flexShrink: 0,
              overflowX: "auto",
            }}
          >
            {Array.from(range.items.entries())
              .filter(
                ([offset, photo]) =>
                  photo.type === "photo" && Math.abs(offset - position) <= 3,
              )
              .sort(([left], [right]) => left - right)
              .map(([offset, photo]) => {
                if (photo.type !== "photo") return null;
                const thumb = mediaArtworkPath(photo, "landscape");
                return (
                  thumb && (
                    <Box
                      component="button"
                      key={offset}
                      aria-label={`View ${photo.title}`}
                      onClick={() => openAt(offset)}
                      sx={{
                        p: 0,
                        flexShrink: 0,
                        border:
                          offset === index && photo.ratingKey === id
                            ? "2px solid"
                            : 0,
                        borderColor: "primary.main",
                        bgcolor: "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <Box
                        component="img"
                        src={getTranscodeImageURL(thumb, 160, 100)}
                        alt=""
                        sx={{
                          height: 60,
                          width: 90,
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    </Box>
                  )
                );
              })}
          </Stack>
        )}
      </Box>
    </Dialog>
  );
}
