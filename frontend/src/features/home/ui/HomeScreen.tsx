import { Box, Skeleton } from "@mui/material";
import { MovieItemSlider } from "features/library/public";
import React from "react";
import { useUserSettings } from "features/settings/model";
import { useWatchListCache } from "states/WatchListCache";
import { useHomeDiscovery } from "../model/useHomeDiscovery";
import HomeHero from "./HomeHero";
import { homeHeroContentSx } from "./homeHeroLayout";

export default function HomeScreen() {
  const { watchListCache } = useWatchListCache();
  const { settings } = useUserSettings();
  const { shelves, hero, heroLoading, clearHero } =
    useHomeDiscovery(settings);

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
        hero && <HomeHero item={hero} onArtworkError={clearHero} />
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
          mt: hero || heroLoading ? "-20vh" : "80px",
          zIndex: 1,
        }}
      >
        <MovieItemSlider
          title="Continue Watching"
          dir="/library/onDeck"
          link="/library/onDeck"
        />

        {watchListCache.length > 0 && (
          <MovieItemSlider
            title="Watchlist"
            data={watchListCache}
            plexTvSource
            link="/plextv/watchlist"
          />
        )}

        {shelves.map((shelf) => (
          <MovieItemSlider
            key={`${shelf.libraryID}:${shelf.dir}`}
            title={shelf.title}
            dir={shelf.dir}
            shuffle
            link={shelf.link}
          />
        ))}
      </Box>
    </Box>
  );
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
      <Box sx={homeHeroContentSx}>
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
