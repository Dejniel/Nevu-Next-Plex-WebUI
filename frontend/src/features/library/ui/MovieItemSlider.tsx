import { Alert, Box, Button, Skeleton, Typography } from "@mui/material";
import React from "react";
import { getLibraryDirectory } from "../api/libraryDirectories";
import { ArrowForwardIosRounded } from "@mui/icons-material";
import { Link, To, useLocation } from "react-router-dom";
import { shuffleArray } from "shared/lib/arrays";
import { ActionableMediaCard } from "features/media-actions/public";
import {
  getLibraryCardWidth,
  LibraryCardLayout,
} from "./LibraryCardViewControls";
import {
  libraryRangeStore,
  useLibraryQueryRange,
} from "../model/LibraryRangeStore";
import type { LibraryQuery } from "../model/libraryQuery";
import { libraryBrowseTo } from "shared/lib/navigation";

const QUERY_SHELF_LIMIT = 40;

function MovieItemSlider({
  title,
  dir,
  link,
  shuffle,
  data,
  plexTvSource,
  layout = "landscape",
  cardSize,
  query,
  browseTo,
}: {
  title: string;
  dir?: string;
  link?: string;
  shuffle?: boolean;
  data?: Plex.Metadata[];
  plexTvSource?: boolean;
  layout?: LibraryCardLayout;
  cardSize?: number;
  query?: LibraryQuery;
  browseTo?: To;
}) {
  const location = useLocation();
  const [items, setItems] = React.useState<Plex.Metadata[] | null>(
    data ?? null,
  );
  const [directoryError, setDirectoryError] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const { queryKey, range: queryRange } = useLibraryQueryRange(query);

  React.useEffect(() => {
    if (queryKey) libraryRangeStore.demand(queryKey, 0, QUERY_SHELF_LIMIT - 1);
  }, [queryKey]);

  const queryItems = React.useMemo(() => {
    if (!query) return null;
    if (queryRange.totalSize === null && queryRange.items.size === 0)
      return null;
    const count = Math.min(
      QUERY_SHELF_LIMIT,
      queryRange.totalSize ?? queryRange.knownSize,
    );
    return Array.from({ length: count }, (_, index) =>
      queryRange.items.get(index),
    ).filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [query, queryRange]);
  const displayedItems = query ? queryItems : items;
  const browseTarget =
    browseTo || (link ? libraryBrowseTo(location, link) : null);

  const [currPage, setCurrPage] = React.useState(0);
  const touchStartX = React.useRef<number | null>(null);

  const calculateItemsPerPage = React.useCallback(
    (width: number) => {
      if (cardSize !== undefined) {
        const availableWidth = width * 0.95;
        const targetWidth = getLibraryCardWidth(layout, cardSize);
        return Math.min(
          10,
          Math.max(1, Math.floor((availableWidth + 10) / (targetWidth + 10))),
        );
      }

      if (width < 600) return 1;
      if (width < 1200) return 2;
      if (width < 1500) return 4;
      if (width < 2000) return 5;
      if (width < 3000) return 6;
      if (width < 4000) return 7;
      if (width < 5000) return 8;
      return 6;
    },
    [cardSize, layout],
  );

  const [itemsPerPage, setItemsPerPage] = React.useState(
    calculateItemsPerPage(window.innerWidth),
  );

  React.useEffect(() => {
    const handleResize = () => {
      setItemsPerPage(calculateItemsPerPage(window.innerWidth));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [calculateItemsPerPage]);

  React.useEffect(() => {
    let active = true;
    setDirectoryError(false);
    if (data !== undefined) return setItems(data);
    if (query) return;
    if (!dir) return setItems([]);

    setItems(null);
    void getLibraryDirectory(dir)
      .then((res) => {
        if (!active) return;
        const metadata = res.Metadata ?? [];
        setItems(shuffle ? shuffleArray(metadata) : metadata);
      })
      .catch(() => {
        if (active) setDirectoryError(true);
      });
    return () => {
      active = false;
    };
  }, [attempt, data, dir, query, shuffle]);

  React.useEffect(() => {
    setCurrPage(0);
  }, [data, dir, itemsPerPage, layout]);

  const queryError = queryRange.errors.get(0);
  if (!displayedItems && (query ? queryError : directoryError))
    return (
      <Box sx={{ width: "100%", px: "2.5vw" }}>
        <Alert
          severity="error"
          action={
            (query ? queryError?.retryable && queryKey : dir) ? (
              <Button
                color="inherit"
                onClick={() => {
                  if (query && queryKey) libraryRangeStore.retry(queryKey, 0);
                  else setAttempt((current) => current + 1);
                }}
              >
                Retry
              </Button>
            ) : undefined
          }
        >
          Unable to load {title.toLocaleLowerCase()}.
        </Alert>
      </Box>
    );

  if (!displayedItems)
    return (
      <MovieItemSliderSkeleton
        title={title}
        itemsPerPage={itemsPerPage}
        layout={layout}
      />
    );

  if (query ? queryRange.totalSize === 0 : displayedItems.length === 0)
    return null;

  const itemCount = displayedItems.slice(0, itemsPerPage * 5).length;
  const pageCount = Math.ceil(itemCount / itemsPerPage);
  const changePage = (step: number) => {
    if (pageCount > 1)
      setCurrPage((page) => (page + step + pageCount) % pageCount);
  };
  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - event.changedTouches[0].clientX;
    touchStartX.current = null;
    if (Math.abs(delta) >= 50) changePage(delta > 0 ? 1 : -1);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "auto",
        gap: "10px",
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: "auto",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          px: "2.5vw",
        }}
      >
        {browseTarget ? (
          <Box
            component={Link}
            to={browseTarget}
            sx={{
              ...shelfHeadingSx,
              color: "inherit",
              textDecoration: "none",
            }}
          >
            <ShelfHeading title={title} browsable />
          </Box>
        ) : (
          <Box
            sx={{
              ...shelfHeadingSx,
              cursor: "default",
              color: "inherit",
            }}
          >
            <ShelfHeading title={title} browsable={false} />
          </Box>
        )}

        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            visibility: itemCount > itemsPerPage ? "visible" : "hidden",
          }}
        >
          {Array.from({ length: pageCount }, (_, page) => (
            <Box
              key={page}
              sx={{
                width: "10px",
                height: "4px",
                backgroundColor: page === currPage ? "#FFFFFF" : "#FFFFFF55",
                transition: "all 0.5s ease",
                mx: "2px",
                cursor: "pointer",
              }}
              onClick={() => setCurrPage(page)}
            />
          ))}
        </Box>
      </Box>
      <Box
        sx={{
          width: "100vw",
          height: "auto",
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",

          py: "10px",
          whiteSpace: "nowrap",
          overflowX: "clip",
          overflowY: "visible",
          position: "relative",
        }}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0].clientX;
        }}
        onTouchEnd={handleTouchEnd}
      >
        <SliderArrow
          side="left"
          visible={pageCount > 1}
          onClick={() => changePage(-1)}
        />
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            transform: `translateX(calc((-${currPage} * (100vw - 5vw) + 2.5vw)))`,
            alignItems: "flex-start",
            justifyContent: "center",
            width: `auto`,
            gap: "10px",
            transition: { xs: "transform 0.35s ease", md: "transform 1s ease" },
          }}
        >
          {displayedItems.slice(0, itemsPerPage * 5).map((item, i) => {
            const start = currPage * itemsPerPage - itemsPerPage;
            const end = currPage * itemsPerPage + itemsPerPage * 2;

            if (i >= start && i < end) {
              return (
                <ActionableMediaCard
                  key={item.ratingKey}
                  item={item}
                  itemsPerPage={itemsPerPage}
                  index={i}
                  PlexTvSource={plexTvSource}
                  layout={layout}
                  refetchData={
                    queryKey && query?.source === "onDeck"
                      ? () => libraryRangeStore.invalidateQuery(queryKey)
                      : dir && dir.endsWith("onDeck")
                        ? () => setAttempt((current) => current + 1)
                        : undefined
                  }
                />
              );
            } else {
              return (
                <Box
                  style={{
                    width: `calc((100vw - 5vw) / ${itemsPerPage} - 10px)`,
                    backgroundColor: "#1C1C1C",
                  }}
                  key={i}
                >
                  <Box
                    sx={{
                      width: "100%",
                      height: "auto",
                      aspectRatio: layout === "poster" ? "2/3" : "16/9",
                    }}
                  />
                  <Box sx={{ width: "100%", height: "60px" }} />
                </Box>
              );
            }
          })}
        </Box>
        <SliderArrow
          side="right"
          visible={pageCount > 1}
          onClick={() => changePage(1)}
        />
      </Box>
    </Box>
  );
}

const shelfHeadingSx = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  mb: "-10px",
  cursor: "pointer",
  "&:hover": {
    gap: "20px",
  },
  "&:hover > :nth-child(2)": {
    opacity: 1,
    gap: "5px",
  },
  transition: "all 0.5s ease",
  userSelect: "none",
} as const;

function ShelfHeading({
  title,
  browsable,
}: {
  title: string;
  browsable: boolean;
}) {
  return (
    <>
      <Typography
        variant="h4"
        sx={{
          fontSize: { xs: "1.3rem", sm: "1.6rem", md: "2rem" },
          fontWeight: "bold",
          mb: "0px",
        }}
      >
        {title}
      </Typography>

      {browsable && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            mt: "0px",
            opacity: 0,
            gap: "0px",
            transition: "all 0.5s ease",
            color: "primary.main",
          }}
        >
          <Typography sx={{ fontSize: "1rem" }}>Browse</Typography>
          <ArrowForwardIosRounded fontSize="small" />
        </Box>
      )}
    </>
  );
}

function SliderArrow({
  side,
  visible,
  onClick,
}: {
  side: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      sx={{
        width: { xs: "40px", sm: "2.5vw" },
        minWidth: { sm: "30px" },
        height: "16vh",
        position: "absolute",
        [side]: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        visibility: visible ? "visible" : "hidden",
        transition: "background-color 0.2s ease",
        "&:hover": { backgroundColor: "#000000AA" },
      }}
      onClick={onClick}
    >
      <ArrowForwardIosRounded
        fontSize="large"
        sx={side === "left" ? { transform: "rotate(180deg)" } : undefined}
      />
    </Box>
  );
}

function MovieItemSliderSkeleton({
  title,
  itemsPerPage,
  layout,
}: {
  title: string;
  itemsPerPage: number;
  layout: LibraryCardLayout;
}) {
  return (
    <Box aria-hidden="true" sx={{ width: "100%" }}>
      <Typography
        variant="h4"
        sx={{
          px: "2.5vw",
          mb: "10px",
          fontSize: { xs: "1.3rem", sm: "1.6rem", md: "2rem" },
          fontWeight: "bold",
        }}
      >
        {title}
      </Typography>
      <Box
        sx={{ display: "flex", gap: "10px", px: "2.5vw", overflow: "hidden" }}
      >
        {Array.from({ length: itemsPerPage }, (_, index) => (
          <Box
            key={index}
            sx={{
              width: `calc((100vw / ${itemsPerPage}) - 10px - (5vw / ${itemsPerPage}))`,
              minWidth: `calc((100vw / ${itemsPerPage}) - 10px - (5vw / ${itemsPerPage}))`,
            }}
          >
            <Skeleton
              variant="rounded"
              animation="wave"
              sx={{
                width: "100%",
                aspectRatio: layout === "poster" ? "2/3" : "16/9",
                height: "auto",
                borderRadius: "8px",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
              }}
            />
            <Skeleton width="68%" height={24} sx={{ mt: 1 }} />
            <Skeleton width="42%" height={17} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default MovieItemSlider;
