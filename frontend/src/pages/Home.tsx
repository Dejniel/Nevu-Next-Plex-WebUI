import { Box, Skeleton } from "@mui/material";
import React, { useEffect } from "react";
import {
  getAllLibraries,
  getLibraryDir,
  getLibraryMeta,
  getLibrarySecondary,
} from "../plex";
import { shuffleArray } from "../common/ArrayExtra";
import MovieItemSlider from "../components/MovieItemSlider";
import HeroDisplay from "../components/HeroDisplay";
import { useWatchListCache } from "../states/WatchListCache";
import { useUserSettings } from "../states/UserSettingsState";
import { normalizeLibraryNavigation } from "../plex/libraryNavigation";
import {
  hasHeroArtwork,
  heroCandidates,
  randomLibraryWindow,
} from "../plex/homeHero";
import { homeHeroContentSx } from "../components/homeHeroLayout";

const HERO_WINDOW_SIZE = 8;

export default function Home() {
  const [featured, setFeatured] = React.useState<
    PerPlexed.RecommendationShelf[]
  >([]);
  const [randomItem, setRandomItem] = React.useState<Plex.Metadata | null>(
    null
  );
  const { watchListCache } = useWatchListCache();
  const { settings, loaded: settingsLoaded } = useUserSettings();

  const [heroLoading, setHeroLoading] = React.useState(true);

  useEffect(() => {
    if (!settingsLoaded) return;

    async function fetchData() {
      setHeroLoading(true);
      setRandomItem(null);
      try {
        const librariesData = await getAllLibraries();

        const filteredLibraries = normalizeLibraryNavigation(
          librariesData.filter((library) => ["movie", "show"].includes(library.type)),
          settings,
        ).pinned.slice(0, 4);

        const featuredRequest = getRecommendations(filteredLibraries).then(
          setFeatured,
        );
        const heroRequest = getRandomItem(filteredLibraries)
          .then(setRandomItem)
          .finally(() => setHeroLoading(false));

        await Promise.all([featuredRequest, heroRequest]);
      } catch (error) {
        console.error("Error fetching data", error);
        setHeroLoading(false);
      }
    }

    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",

        pt: "-64px",
      }}
    >
      {heroLoading ? (
        <HomeHeroSkeleton />
      ) : (
        randomItem && (
          <HeroDisplay item={randomItem} onArtworkError={() => setRandomItem(null)} />
        )
      )}
      <Box
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          gap: 8,
          pb: 8,
          mt: randomItem || heroLoading ? "-20vh" : "80px",
          zIndex: 1,
        }}
      >
        <MovieItemSlider
          title="Continue Watching"
          dir="/library/onDeck"
          link="/library/onDeck"
        />

        {watchListCache && watchListCache.length > 0 && (
          <MovieItemSlider
            title="Watchlist"
            data={watchListCache}
            plexTvSource={true}
            link="/plextv/watchlist"
          />
        )}

        {featured &&
          featured.map((item, index) => (
            <MovieItemSlider
              key={index}
              title={item.title}
              dir={item.dir}
              shuffle={true}
              link={item.link}
            />
          ))}
      </Box>
    </Box>
  );
}

async function getRecommendations(libraries: Plex.Directory[]) {
  const genreSelection: PerPlexed.RecommendationShelf[] = [];

  for (const library of libraries) {
    const genres = await getLibrarySecondary(library.key, "genre");

    if (!genres || !genres.length) continue;

    const selectGenres: Plex.Directory[] = [];

    // Get 5 random genres
    while (selectGenres.length < Math.min(5, genres.length)) {
      const genre = genres[Math.floor(Math.random() * genres.length)];
      if (selectGenres.includes(genre)) continue;
      selectGenres.push(genre);
    }

    for (const genre of selectGenres) {
      genreSelection.push({
        title: `${library.title} - ${genre.title}`,
        libraryID: library.key,
        dir: `/library/sections/${library.key}/genre/${genre.key}`,
        link: `/library/sections/${library.key}/genre/${genre.key}`,
      });
    }
  }

  return shuffleArray(genreSelection);
}

async function getRandomItem(libraries: Plex.Directory[]) {
  for (const library of shuffleArray(libraries)) {
    try {
      const path = `/library/sections/${library.key}/all`;
      const summary = await getLibraryDir(path, {
        sort: "titleSort:asc",
        "X-Plex-Container-Start": 0,
        "X-Plex-Container-Size": 0,
      });
      const window = randomLibraryWindow(summary.totalSize ?? summary.size, HERO_WINDOW_SIZE);
      if (!window) continue;

      const first = await getLibraryDir(path, {
        sort: "titleSort:asc",
        "X-Plex-Container-Start": window.start,
        "X-Plex-Container-Size": window.size,
      });
      let items = first.Metadata || [];

      if (window.wrapSize) {
        const wrapped = await getLibraryDir(path, {
          sort: "titleSort:asc",
          "X-Plex-Container-Start": 0,
          "X-Plex-Container-Size": window.wrapSize,
        });
        items = [...items, ...(wrapped.Metadata || [])];
      }

      for (const candidate of heroCandidates(items)) {
        const metadata = await getLibraryMeta(candidate.ratingKey);
        if (hasHeroArtwork(metadata)) return metadata;
      }
    } catch (error) {
      console.log(`Error fetching a random item from library ${library.key}`, error);
    }
  }

  return null;
}

function HomeHeroSkeleton() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: "100%",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "background.default",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      <Skeleton
        variant="rectangular"
        animation="wave"
        sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <Box
        sx={{
          ...homeHeroContentSx,
        }}
      >
        <Box sx={{ width: { xs: "85vw", sm: "60vw", md: "35vw" } }}>
          <Skeleton width="22%" height={28} />
          <Skeleton width="72%" height={58} />
          <Skeleton width="100%" height={22} />
          <Skeleton width="84%" height={22} />
          <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
            <Skeleton variant="rounded" width={112} height={38} />
            <Skeleton variant="rounded" width={46} height={38} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
