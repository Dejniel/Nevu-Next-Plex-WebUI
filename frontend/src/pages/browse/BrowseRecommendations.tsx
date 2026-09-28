import type { LibraryFilterExpression, LibraryItemType } from "@nevu/contracts";
import { Box, CircularProgress, Typography } from "@mui/material";
import { motion } from "framer-motion";
import React, { useEffect } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { AuthStorage } from "../../auth/AuthStorage";
import { useLibraryCardView } from "../../components/LibraryCardViewControls";
import LibraryCollectionDialog from "../../components/LibraryCollectionDialog";
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
import { LibraryQuery } from "../../states/LibraryRangeStore";
import { recommendationShelfTo } from "../../navigation";

interface RecommendationShelf {
  id: string;
  title: string;
  query: LibraryQuery;
}

const HISTORY_LIMIT = 40;

const containerProps = (size = HISTORY_LIMIT) => ({
  "X-Plex-Container-Start": 0,
  "X-Plex-Container-Size": size,
});

function isLibraryItemType(value: string | undefined): value is LibraryItemType {
  return value === "movie" || value === "show" || value === "episode";
}

function clause(
  field: string,
  operator: "=" | "!=",
  value: string,
): LibraryFilterExpression {
  return { kind: "clause", field, operator, value };
}

async function getItems(
  path: string,
  props?: { [key: string]: string | number },
) {
  try {
    return (await getLibraryDir(path, props)).Metadata || [];
  } catch (error) {
    console.error(`Could not load recommendation context ${path}`, error);
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

async function buildRecommendationShelves(
  libraryID: string,
  library: Plex.MediaContainer,
) {
  const sectionId = Number(libraryID);
  const itemType = library.Type
    ?.map((entry) => entry.type)
    .find(isLibraryItemType);
  if (!Number.isSafeInteger(sectionId) || sectionId < 1 || !itemType) return [];

  const profile = AuthStorage.getActiveSession()?.profile;
  const common = {
    profileKey: profile ? String(profile.id) : "owner",
    sectionId,
    type: itemType,
  } satisfies Omit<LibraryQuery, "sort">;
  const basePath = `/library/sections/${libraryID}`;
  const historyFilter = clause("unwatched", "!=", "1");

  const [watchHistory, genres, actors] = await Promise.all([
    getItems(`${basePath}/all`, {
      sort: "lastViewedAt:desc",
      "unwatched!": 1,
      ...containerProps(),
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
  const topUnwatched = clause("unwatched", "=", "1");
  const shelves: RecommendationShelf[] = [
    {
      id: "continue-watching",
      title: "Continue Watching",
      query: { ...common, source: "onDeck", sort: "lastViewedAt:desc" },
    },
    {
      id: "recently-released",
      title: "Recently Released",
      query: { ...common, sort: "originallyAvailableAt:desc" },
    },
    {
      id: "recently-added",
      title: "Recently Added",
      query: { ...common, sort: "addedAt:desc" },
    },
    {
      id: "top-rated-unwatched",
      title: "Top Rated Unwatched",
      query: {
        ...common,
        sort: "audienceRating:desc",
        filterExpression: topUnwatched,
      },
    },
    ...(genre ? [{
      id: `genre-${genre.key}`,
      title: `Top ${genre.title} Picks`,
      query: {
        ...common,
        sort: "audienceRating:desc",
        filterExpression: {
          kind: "group" as const,
          mode: "and" as const,
          children: [clause("genre", "=", String(genre.key)), topUnwatched],
        },
      },
    }] : []),
    ...(actor ? [{
      id: `actor-${actor.key}`,
      title: `More with ${actor.title}`,
      query: {
        ...common,
        sort: "audienceRating:desc",
        filterExpression: {
          kind: "group" as const,
          mode: "and" as const,
          children: [clause("actor", "=", String(actor.key)), topUnwatched],
        },
      },
    }] : []),
    {
      id: "recently-watched",
      title: "Recently Watched",
      query: {
        ...common,
        sort: "lastViewedAt:desc",
        filterExpression: historyFilter,
      },
    },
  ];

  return shelves;
}

function BrowseRecommendations({
  pageNavigation,
}: {
  pageNavigation: React.ReactNode;
}) {
  const { libraryID } = useParams<{ libraryID: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const cardView = useLibraryCardView();
  const [library, setLibrary] = React.useState<Plex.MediaContainer | null>(null);
  const [shelves, setShelves] = React.useState<RecommendationShelf[] | null>(null);

  useEffect(() => {
    if (!libraryID) return;
    let cancelled = false;

    setLibrary(null);
    setShelves(null);
    getLibrary(libraryID)
      .then(async (nextLibrary) => {
        if (nextLibrary.librarySectionID.toString() !== libraryID) return [];
        if (!cancelled) setLibrary(nextLibrary);
        return buildRecommendationShelves(libraryID, nextLibrary);
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

  const selectedShelf =
    shelves?.find((shelf) => shelf.id === searchParams.get("shelf")) || null;
  const closeShelf = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("shelf");
    setSearchParams(next);
  };

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
              key={shelf.id}
              title={shelf.title}
              query={shelf.query}
              browseTo={recommendationShelfTo(location, shelf.id)}
              layout={cardView.layout}
              cardSize={cardView.size}
            />
          ))}
        </Box>
      )}

      <LibraryCollectionDialog
        key={selectedShelf?.id || "closed"}
        open={Boolean(selectedShelf)}
        title={selectedShelf?.title || "Browse"}
        baseQuery={selectedShelf?.query || null}
        sortDefinitions={library?.Type?.find(
          (entry) => entry.type === selectedShelf?.query.type,
        )?.Sort}
        cardView={cardView}
        emptyMessage="No items are available for this recommendation."
        onClose={closeShelf}
      />
    </Box>
  );
}

export default BrowseRecommendations;
