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

function BrowseLibrary() {
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

  const [typeFilter, setTypeFilter] = React.useState<string>(
    localStorage.getItem("typeFilter") || "any"
  );

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

  useEffect(() => {
    if (!libraryID) return;
    getLibrary(libraryID).then((data) => {
      setLibrary(data);
    });
  }, [libraryID]);

  useEffect(() => {
    setItems(null);
    setIsLoading(true);

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

    if (!library) return;
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
      if (!media) return;

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
  }, [library, primaryFilter, sortBy, typeFilter]);

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
          pt: { xs: 6, md: 0.5 },
          pb: 1,
          pr: { md: "350px" },
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 1,
          flexWrap: "wrap",
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
              localStorage.setItem("typeFilter", e.target.value);
            }}
            size="small"
          >
            <MenuItem value="any">
              {items?.viewGroup &&
                `${items?.viewGroup
                  .slice(0, 1)
                  .toUpperCase()}${items?.viewGroup.slice(1)}s`}
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

        <Select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            localStorage.setItem("sortBy", e.target.value);
          }}
          size="small"
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

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            minWidth: { xs: "150px", sm: "180px" },
          }}
        >
          <GridViewRounded sx={{ fontSize: 17, opacity: 0.65 }} />
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
            sx={{ minWidth: 90, maxWidth: 150 }}
          />
          <GridViewRounded sx={{ fontSize: 24, opacity: 0.8 }} />
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
                    <Box sx={{ height: "104px" }} />
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
          <Box sx={{ width: "100%", height: "104px" }} />
        </Box>
      )}
    </div>
  );
}
