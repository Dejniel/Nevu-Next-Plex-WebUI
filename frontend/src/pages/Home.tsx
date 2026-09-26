import { Box, CircularProgress } from "@mui/material";
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
import { hasHeroArtwork, pickHeroCandidate } from "../plex/homeHero";

export default function Home() {
  const [featured, setFeatured] = React.useState<
    PerPlexed.RecommendationShelf[]
  >([]);
  const [randomItem, setRandomItem] = React.useState<Plex.Metadata | null>(
    null
  );
  const { watchListCache } = useWatchListCache();
  const { settings, loaded: settingsLoaded } = useUserSettings();

  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    if (!settingsLoaded) return;

    async function fetchData() {
      setLoading(true);
      setRandomItem(null);
      try {
        const librariesData = await getAllLibraries();

        const filteredLibraries = normalizeLibraryNavigation(
          librariesData.filter((library) => ["movie", "show"].includes(library.type)),
          settings,
        ).pinned.slice(0, 4);

        const featuredData = await getRecommendations(filteredLibraries);
        setFeatured(featuredData);

        const randomItemData = await getRandomItem(filteredLibraries);

        if (!randomItemData) return;

        const data = await getLibraryMeta(randomItemData?.ratingKey as string);
        if (hasHeroArtwork(data)) setRandomItem(data);
      } catch (error) {
        console.error("Error fetching data", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);
  if (loading)
    return (
      <Box
        sx={{
          width: "100vw",
          height: "80vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );

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
      {randomItem && <HeroDisplay item={randomItem} />}
      <Box
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          gap: 8,
          pb: 8,
          mt: randomItem ? "-20vh" : "80px",
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
      const items = await getLibraryDir(`/library/sections/${library.key}/all`, {
        sort: "random:desc",
        limit: 20,
      });
      const candidate = pickHeroCandidate(items.Metadata);
      if (candidate) return candidate;
    } catch (error) {
      console.log(`Error fetching a random item from library ${library.key}`, error);
    }
  }

  return null;
}
