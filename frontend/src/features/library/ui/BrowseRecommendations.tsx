import type { MediaMetadata } from "entities/media/model";
import type { LibraryFilterExpression, LibraryItemType } from "@nevu/contracts";
import { Box, CircularProgress, Typography } from "@mui/material";
import { motion } from "motion/react";
import React from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { serverQueryClient } from "shared/api/queryClient";
import {
  libraryDirectoryQueryOptions,
  librarySectionQueryOptions,
} from "../model/libraryDirectories";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { useActiveServerScope } from "features/session/model";
import { useLibraryCardView } from "./LibraryCardViewControls";
import LibraryCollectionDialog from "./LibraryCollectionDialog";
import LibraryViewToolbar from "./LibraryViewToolbar";
import MovieItemSlider from "./MovieItemSlider";
import {
  matchRecommendationDirectory,
  pickPreferredTag,
} from "../model/libraryRecommendations";
import type { LibraryQuery } from "../model/libraryQuery";
import { recommendationShelfTo } from "shared/lib/navigation";

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

function clause(field: string, operator: "=" | "!=", value: string): LibraryFilterExpression {
  return { kind: "clause", field, operator, value };
}

function buildRecommendationShelves(
  libraryID: string,
  library: Plex.MediaContainer,
  profileKey: string,
  watchHistory: MediaMetadata[],
  genres: Plex.Directory[],
  actors: Plex.Directory[],
) {
  const sectionId = Number(libraryID);
  const itemType = library.Type?.map((entry) => entry.type).find(isLibraryItemType);
  if (!Number.isSafeInteger(sectionId) || sectionId < 1 || !itemType) return [];

  const common = {
    profileKey,
    sectionId,
    type: itemType,
  } satisfies Omit<LibraryQuery, "sort">;
  const historyFilter = clause("unwatched", "!=", "1");

  const genre = matchRecommendationDirectory(pickPreferredTag(watchHistory, "Genre"), genres);
  const actor = matchRecommendationDirectory(pickPreferredTag(watchHistory, "Role"), actors);
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
    ...(genre
      ? [
          {
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
          },
        ]
      : []),
    ...(actor
      ? [
          {
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
          },
        ]
      : []),
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

function BrowseRecommendations({ pageNavigation }: { pageNavigation: React.ReactNode }) {
  const { libraryID } = useParams<{ libraryID: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const cardView = useLibraryCardView();
  const scope = useActiveServerScope();
  const profileKey = scope.profileKey;
  const section = useQuery(librarySectionQueryOptions(scope, libraryID ?? ""), serverQueryClient);
  const library = section.data;
  const supported = Boolean(
    libraryID && profileKey && library?.Type?.some((entry) => isLibraryItemType(entry.type)),
  );
  const basePath = `/library/sections/${encodeURIComponent(libraryID ?? "")}`;
  const context = useQueries(
    {
      queries: [
        libraryDirectoryQueryOptions(scope, `${basePath}/all`, {
          sort: "lastViewedAt:desc",
          "unwatched!": 1,
          ...containerProps(),
        }),
        libraryDirectoryQueryOptions(scope, `${basePath}/genre`),
        libraryDirectoryQueryOptions(scope, `${basePath}/actor`),
      ].map((options) => ({ ...options, enabled: supported })),
      combine: (results) => ({
        pending: results.some((result) => result.isPending),
        history: results[0].data?.Metadata ?? [],
        genres: results[1].data?.Directory ?? [],
        actors: results[2].data?.Directory ?? [],
      }),
    },
    serverQueryClient,
  );
  const shelves = React.useMemo(() => {
    if (section.isPending || (supported && context.pending)) return null;
    if (!libraryID || !profileKey || !library || String(library.librarySectionID) !== libraryID)
      return [];
    return buildRecommendationShelves(
      libraryID,
      library,
      profileKey,
      context.history,
      context.genres,
      context.actors,
    );
  }, [section.isPending, supported, context, libraryID, library, profileKey]);

  const selectedShelf = shelves?.find((shelf) => shelf.id === searchParams.get("shelf")) || null;
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
        sortDefinitions={
          library?.Type?.find((entry) => entry.type === selectedShelf?.query.type)?.Sort
        }
        cardView={cardView}
        emptyMessage="No items are available for this recommendation."
        onClose={closeShelf}
      />
    </Box>
  );
}

export default BrowseRecommendations;
