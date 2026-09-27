import { Box, CircularProgress, Typography } from "@mui/material";
import { motion } from "framer-motion";
import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useLibraryCardView } from "../../components/LibraryCardViewControls";
import LibraryViewToolbar from "../../components/LibraryViewToolbar";
import MovieItemSlider from "../../components/MovieItemSlider";
import {
  getLibrary,
  getLibraryDir,
  getLibrarySecondary,
} from "../../plex";
import {
  matchRecommendationDirectory,
  pickPreferredTag,
} from "../../plex/libraryRecommendations";

interface RecommendationShelf {
  title: string;
  items: Plex.Metadata[];
  link: string;
  browseProps?: { [key: string]: string | number };
}

const SHELF_LIMIT = 40;
const HISTORY_LIMIT = 40;

const containerProps = (size = SHELF_LIMIT) => ({
  "X-Plex-Container-Start": 0,
  "X-Plex-Container-Size": size,
});

async function getItems(
  path: string,
  props?: { [key: string]: string | number },
) {
  try {
    return (await getLibraryDir(path, props)).Metadata || [];
  } catch (error) {
    console.error(`Could not load recommendation shelf ${path}`, error);
    return [];
  }
}

async function getDirectories(libraryID: string, directory: string) {
  try {
    return await getLibrarySecondary(libraryID, directory);
  } catch (error) {
    console.error(`Could not load ${directory} directories`, error);
    return [];
  }
}

async function buildRecommendationShelves(libraryID: string) {
  const basePath = `/library/sections/${libraryID}`;
  const recentlyReleasedProps = { sort: "originallyAvailableAt:desc" };
  const topRatedProps = { sort: "audienceRating:desc", unwatched: 1 };
  const historyFilters = {
    sort: "lastViewedAt:desc",
    "unwatched!": 1,
  };

  const [
    continueWatching,
    recentlyReleased,
    recentlyAdded,
    topRatedUnwatched,
    watchHistory,
    genres,
    actors,
  ] = await Promise.all([
    getItems(`${basePath}/onDeck`, containerProps()),
    getItems(`${basePath}/all`, {
      ...recentlyReleasedProps,
      ...containerProps(),
    }),
    getItems(`${basePath}/recentlyAdded`, containerProps()),
    getItems(`${basePath}/all`, {
      ...topRatedProps,
      ...containerProps(),
    }),
    getItems(`${basePath}/all`, {
      ...historyFilters,
      ...containerProps(HISTORY_LIMIT),
    }),
    getDirectories(libraryID, "genre"),
    getDirectories(libraryID, "actor"),
  ]);

  const genre = matchRecommendationDirectory(
    pickPreferredTag(watchHistory, "Genre"),
    genres,
  );
  const actor = matchRecommendationDirectory(
    pickPreferredTag(watchHistory, "Role"),
    actors,
  );

  const [genreRecommendations, actorRecommendations] = await Promise.all([
    genre
      ? getItems(`${basePath}/all`, {
          genre: genre.key,
          sort: "audienceRating:desc",
          unwatched: 1,
          ...containerProps(),
        })
      : Promise.resolve([]),
    actor
      ? getItems(`${basePath}/all`, {
          actor: actor.key,
          sort: "audienceRating:desc",
          unwatched: 1,
          ...containerProps(),
        })
      : Promise.resolve([]),
  ]);

  const genreProps = genre
    ? { genre: genre.key, ...topRatedProps }
    : undefined;
  const actorProps = actor
    ? { actor: actor.key, ...topRatedProps }
    : undefined;

  const shelves: RecommendationShelf[] = [
    {
      title: "Continue Watching",
      items: continueWatching,
      link: `${basePath}/onDeck`,
    },
    {
      title: "Recently Released",
      items: recentlyReleased,
      link: `${basePath}/all`,
      browseProps: recentlyReleasedProps,
    },
    {
      title: "Recently Added",
      items: recentlyAdded,
      link: `${basePath}/recentlyAdded`,
    },
    {
      title: "Top Rated Unwatched",
      items: topRatedUnwatched,
      link: `${basePath}/all`,
      browseProps: topRatedProps,
    },
    {
      title: genre ? `Top ${genre.title} Picks` : "Top Genre Picks",
      items: genreRecommendations,
      link: `${basePath}/all`,
      browseProps: genreProps,
    },
    {
      title: actor ? `More with ${actor.title}` : "More with Familiar Cast",
      items: actorRecommendations,
      link: `${basePath}/all`,
      browseProps: actorProps,
    },
    {
      title: "Recently Watched",
      items: watchHistory,
      link: `${basePath}/all`,
      browseProps: historyFilters,
    },
  ];

  return shelves.filter((shelf) => shelf.items.length > 0);
}

function BrowseRecommendations({
  pageNavigation,
}: {
  pageNavigation: React.ReactNode;
}) {
  const { libraryID } = useParams<{ libraryID: string }>();
  const cardView = useLibraryCardView();
  const [shelves, setShelves] = React.useState<RecommendationShelf[] | null>(
    null,
  );

  useEffect(() => {
    if (!libraryID) return;
    let cancelled = false;

    setShelves(null);
    getLibrary(libraryID)
      .then((library) => {
        if (library.librarySectionID.toString() !== libraryID) return [];
        return buildRecommendationShelves(libraryID);
      })
      .then((nextShelves) => {
        if (!cancelled) setShelves(nextShelves);
      })
      .catch((error) => {
        console.error("Could not load library recommendations", error);
        if (!cancelled) setShelves([]);
      });

    return () => {
      cancelled = true;
    };
  }, [libraryID]);

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      sx={{
        width: "100%",
        minHeight: "calc(100vh - 64px)",
        mt: "64px",
        pb: 8,
      }}
    >
      <LibraryViewToolbar
        cardView={cardView}
        leading={
          <Typography
            component="h1"
            sx={{
              fontSize: "1rem",
              fontWeight: 700,
              color: "text.secondary",
              textTransform: "uppercase",
            }}
          >
            Recommendations
          </Typography>
        }
        pageNavigation={pageNavigation}
      />

      {shelves === null ? (
        <Box
          sx={{
            minHeight: "60vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CircularProgress />
        </Box>
      ) : shelves.length === 0 ? (
        <Typography sx={{ width: "100%", mt: 8, textAlign: "center" }}>
          No recommendations available.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: { xs: 5, md: 7 },
            mt: { xs: 2, md: 3 },
          }}
        >
          {shelves.map((shelf) => (
            <MovieItemSlider
              key={shelf.title}
              title={shelf.title}
              data={shelf.items}
              link={shelf.link}
              browseProps={shelf.browseProps}
              layout={cardView.layout}
              cardSize={cardView.size}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

export default BrowseRecommendations;
