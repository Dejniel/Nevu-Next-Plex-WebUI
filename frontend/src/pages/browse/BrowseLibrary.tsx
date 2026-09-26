import {
  Box,
  Divider,
  MenuItem,
  Select,
  Skeleton,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import {
  CropLandscapeRounded,
  CropPortraitRounded,
  GridViewRounded,
} from "@mui/icons-material";
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import { getLibrary, getLibraryDir } from "../../plex";
import MovieItem from "../../components/MovieItem";
import { useInView } from "react-intersection-observer";
import { useUserSettings } from "../../states/UserSettingsState";
import { formatLibraryItemCount } from "../../plex/libraryItemCount";

type LibraryCardLayout = "landscape" | "poster";

const DEFAULT_CARD_SIZE = 40;

const normalizeCardSize = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(100, Math.max(0, parsed))
    : DEFAULT_CARD_SIZE;
};

const getCardWidth = (layout: LibraryCardLayout, size: number) =>
  Math.round(layout === "poster" ? 140 + size * 1.6 : 190 + size * 2.2);

const viewGroupLabel = (viewGroup?: string) => {
  switch (viewGroup) {
    case "movie":
      return "Movies";
    case "show":
      return "Shows";
    case "episode":
      return "Episodes";
    default:
      return "All types";
  }
};

export const libTypeToNum = (type: string) => {
  switch (type) {
    case "movie":
      return 1;
    case "show":
      return 2;
    case "episode":
      return 4;
    default:
      return 0;
  }
};

function BrowseLibrary({ pageNavigation }: { pageNavigation: React.ReactNode }) {
  const { libraryID } = useParams<{ libraryID: string }>();
  const { settings, setSetting } = useUserSettings();
  const [library, setLibrary] = React.useState<Plex.MediaContainer | null>(
    null
  );
  const [items, setItems] = React.useState<Plex.MediaContainer | null>(null);

  const [isLoading, setIsLoading] = React.useState(true);

  const [primaryFilter, setPrimaryFilter] = React.useState<string>(
    localStorage.getItem("primaryFilter") || "all"
  );

  const [typeFilter, setTypeFilter] = React.useState("any");

  const [sortBy, setSortBy] = React.useState<string>(
    localStorage.getItem("sortBy") || "title:asc"
  );
  const [cardLayout, setCardLayout] = React.useState<LibraryCardLayout>(
    settings.LIBRARY_CARD_LAYOUT === "poster" ? "poster" : "landscape"
  );
  const [cardSize, setCardSize] = React.useState(() =>
    normalizeCardSize(settings.LIBRARY_CARD_SIZE)
  );

  useEffect(() => {
    setCardLayout(
      settings.LIBRARY_CARD_LAYOUT === "poster" ? "poster" : "landscape"
    );
    setCardSize(normalizeCardSize(settings.LIBRARY_CARD_SIZE));
  }, [settings.LIBRARY_CARD_LAYOUT, settings.LIBRARY_CARD_SIZE]);

  const cardWidth = getCardWidth(cardLayout, cardSize);
  const itemCount = formatLibraryItemCount(items);

  useEffect(() => {
    if (!libraryID) return;
    let cancelled = false;

    setLibrary(null);
    setItems(null);
    setIsLoading(true);
    setTypeFilter(
      localStorage.getItem(`typeFilter:${libraryID}`) || "any"
    );

    getLibrary(libraryID).then((data) => {
      if (!cancelled) setLibrary(data);
    });

    return () => {
      cancelled = true;
    };
  }, [libraryID]);

  useEffect(() => {
    if (
      !library ||
      !libraryID ||
      library.librarySectionID.toString() !== libraryID
    )
      return;

    setItems(null);
    setIsLoading(true);

    const availableTypes = new Set(
      library.Type?.filter((entry) =>
        ["movie", "show", "episode"].includes(entry.type)
      ).map((entry) => entry.type) || []
    );
    if (typeFilter !== "any" && !availableTypes.has(typeFilter)) {
      setTypeFilter("any");
      localStorage.setItem(`typeFilter:${libraryID}`, "any");
      return;
    }

    let conEnd = "all";
    let extraProps = {};
    let sortString = sortBy;

    switch (primaryFilter) {
      case "watched":
        conEnd = "all";
        extraProps = {
          "show.unwatchedLeaves!": 1,
          "unwatched!": 1,
        };
        break;
      default:
        conEnd = primaryFilter;
        break;
    }

    switch (sortBy) {
      case "updated:asc":
      case "updated:desc":
        if (library?.Type?.[0].type === "show") sortString = "title:asc";
        break;
    }

    let cancelled = false;
    getLibraryDir(
      `/library/sections/${library.librarySectionID.toString()}/${conEnd}`,
      {
        ...extraProps,
        ...(primaryFilter === "all" &&
          typeFilter !== "any" && {
            type: libTypeToNum(typeFilter),
          }),
        sort: sortString,
      }
    ).then(async (media) => {
      if (!media || cancelled) return;

      switch (sortBy) {
        case "updated:asc":
        case "updated:desc":
          media.Metadata = media.Metadata?.sort((a, b) => {
            if (sortBy === "updated:asc") return a.updatedAt - b.updatedAt;
            else return b.updatedAt - a.updatedAt;
          });
          break;
      }

      setItems(media);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [library, libraryID, primaryFilter, sortBy, typeFilter]);

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        width: "100%",
        height: "fit-content",
        minHeight: "calc(100vh - 64px)",
        mt: "64px",
      }}
    >
      <Box
        sx={{
          zIndex: 10,
          width: "100%",
          px: { xs: 1, md: 6 },
          pt: { xs: 1, md: 0.5 },
          pb: 1,
          position: "relative",
          display: "grid",
          gridTemplateAreas: {
            xs: '"actions" "filters"',
            lg: '"filters controls pages"',
          },
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            lg: "max-content minmax(0, 1fr) max-content",
          },
          alignItems: "center",
          gap: { xs: 1.25, lg: 1 },
        }}
      >
        <Box
          sx={{
            gridArea: "filters",
            display: "flex",
            alignItems: "center",
            justifyContent: { xs: "space-evenly", lg: "flex-start" },
            flexWrap: { xs: "wrap", lg: "nowrap" },
            gap: 1,
            "& > .MuiInputBase-root": {
              flex: { xs: "1 1 105px", lg: "0 0 auto" },
              minWidth: 0,
            },
          }}
        >
          <Select
            value={primaryFilter}
            onChange={(e) => {
              setPrimaryFilter(e.target.value);
              localStorage.setItem("primaryFilter", e.target.value);
            }}
            size="small"
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="unwatched">Unwatched</MenuItem>
            <MenuItem value="watched">Watched</MenuItem>
            <Divider />
            <MenuItem value="recentlyAdded">Recently Added</MenuItem>
            <MenuItem value="onDeck">On Deck</MenuItem>
            <MenuItem value="newest">Newest</MenuItem>
          </Select>

          {primaryFilter === "all" && (
            <Select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                if (libraryID)
                  localStorage.setItem(
                    `typeFilter:${libraryID}`,
                    e.target.value
                  );
              }}
              size="small"
            >
              <MenuItem value="any">
                {viewGroupLabel(items?.viewGroup || library?.viewGroup)}
              </MenuItem>
              <Divider />
              {library?.Type?.filter((e) =>
                ["movie", "show", "episode"].includes(e.type)
              ).map((type) => (
                <MenuItem key={type.key} value={type.type}>
                  {type.title}
                </MenuItem>
              ))}
            </Select>
          )}

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              minWidth: 0,
              flex: { xs: "1 1 170px", lg: "0 0 auto" },
            }}
          >
            <Select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                localStorage.setItem("sortBy", e.target.value);
              }}
              size="small"
              sx={{ minWidth: 0, flex: "1 1 auto" }}
            >
              <MenuItem value={"title:asc"}>Title (A-Z)</MenuItem>
              <MenuItem value={"title:desc"}>Title (Z-A)</MenuItem>
              <Divider />
              <MenuItem value={"addedAt:asc"}>Date Added (Oldest)</MenuItem>
              <MenuItem value={"addedAt:desc"}>Date Added (Newest)</MenuItem>
              <MenuItem value={"year:asc"}>Year (Oldest)</MenuItem>
              <MenuItem value={"year:desc"}>Year (Newest)</MenuItem>
              <MenuItem value={"updated:asc"}>Date Updated (Oldest)</MenuItem>
              <MenuItem value={"updated:desc"}>Date Updated (Newest)</MenuItem>
              <Divider />
              <MenuItem value={"random:desc"}>Random</MenuItem>
            </Select>

            <Box
              sx={{
                minWidth: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                flexShrink: 0,
              }}
            >
              {isLoading ? (
                <Skeleton width={32} />
              ) : (
                <Box
                  component="span"
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {itemCount}
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            gridArea: { xs: "actions", lg: "auto" },
            display: { xs: "flex", lg: "contents" },
            alignItems: "center",
            justifyContent: "space-between",
            gap: 0.5,
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              gridArea: { lg: "controls" },
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: { xs: 0.75, sm: 1.25 },
              minWidth: 0,
              flex: { xs: "1 1 auto", lg: "0 0 auto" },
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                minWidth: { xs: 94, sm: 180 },
                maxWidth: 210,
                flex: "1 1 auto",
              }}
            >
              <GridViewRounded sx={{ fontSize: 16, opacity: 0.65 }} />
              <Slider
                aria-label="Library card size"
                min={0}
                max={100}
                step={1}
                value={cardSize}
                onChange={(_, value) => setCardSize(value as number)}
                onChangeCommitted={(_, value) =>
                  setSetting("LIBRARY_CARD_SIZE", String(value as number))
                }
                size="small"
                sx={{
                  minWidth: { xs: 48, sm: 90 },
                  maxWidth: 150,
                  "& .MuiSlider-rail": {
                    backgroundColor: "rgba(255,255,255,0.42)",
                    opacity: 1,
                  },
                }}
              />
              <GridViewRounded sx={{ fontSize: 22, opacity: 0.8 }} />
            </Box>

            <ToggleButtonGroup
              exclusive
              size="small"
              value={cardLayout}
              onChange={(_, value: LibraryCardLayout | null) => {
                if (!value) return;
                setCardLayout(value);
                setSetting("LIBRARY_CARD_LAYOUT", value);
              }}
              aria-label="Library card layout"
            >
              <Tooltip title="Landscape cards">
                <ToggleButton value="landscape" aria-label="Landscape cards">
                  <CropLandscapeRounded fontSize="small" />
                </ToggleButton>
              </Tooltip>
              <Tooltip title="Poster cards">
                <ToggleButton value="poster" aria-label="Poster cards">
                  <CropPortraitRounded fontSize="small" />
                </ToggleButton>
              </Tooltip>
            </ToggleButtonGroup>
          </Box>

          <Box
            sx={{
              gridArea: { lg: "pages" },
              display: "flex",
              justifyContent: "flex-end",
              flexShrink: 0,
            }}
          >
            {pageNavigation}
          </Box>
        </Box>
      </Box>

      {/* {isLoading && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "95vh",
          }}
        >
          <CircularProgress />
        </Box>
      )} */}

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          width: "100%",
          height: "fit-content",
          px: { xs: 1, md: 6 },
          pb: 2,
        }}
      >
        <AnimatePresence>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardWidth}px), 1fr))`,
              gap: 2,
              mt: 2,
              width: "100%",
              "& > *": {
                width: `min(100%, ${cardWidth}px)`,
                justifySelf: "center",
              },
            }}
          >
            {isLoading &&
              "1"
                .repeat(50)
                .split("")
                .map((_, index) => (
                  <Box key={index}>
                    <Skeleton
                      variant="rounded"
                      width="100%"
                      height="auto"
                      sx={{
                        width: "100%",
                        height: "auto",
                        aspectRatio: cardLayout === "poster" ? "2/3" : "16/9",
                        borderRadius: "10px",
                      }}
                    />
                    <Box sx={{ height: "60px" }} />
                  </Box>
                ))}
            {items &&
              !isLoading &&
              items.Metadata?.map((item) => (
                <DisplayMovieItem
                  key={item.ratingKey}
                  item={item}
                  layout={cardLayout}
                />
              ))}
          </Box>
        </AnimatePresence>
      </Box>
    </Box>
  );
}

export default BrowseLibrary;

function DisplayMovieItem({
  item,
  layout,
}: {
  item: Plex.Metadata;
  layout: LibraryCardLayout;
}) {
  const { inView, ref } = useInView({
    triggerOnce: true,
    rootMargin: "200px 0px",
  });

  return (
    <div
      ref={ref}
      style={{
        opacity: inView ? 1 : 0,
        transition: "opacity 0.35s ease-in-out",
      }}
    >
      {inView ? (
        <MovieItem item={item} layout={layout} />
      ) : (
        <Box style={{ width: "100%" }}>
          <Box
            sx={{
              width: "100%",
              height: "auto",
              aspectRatio: layout === "poster" ? "2/3" : "16/9",
            }}
          />
          <Box sx={{ width: "100%", height: "60px" }} />
        </Box>
      )}
    </div>
  );
}
