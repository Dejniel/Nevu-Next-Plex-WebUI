import { useQueries, useQuery } from "@tanstack/react-query";
import { useLibraries } from "entities/library/model";
import { mediaMetadataQueryOptions } from "entities/media/model";
import { useActiveServerScope } from "features/session/model";
import type { UserSettings } from "features/settings/model";
import { normalizeLibraryNavigation } from "features/library-navigation/model";
import { libraryDirectoryQueryOptions } from "features/library/model";
import { useMemo, useState } from "react";
import { serverQueryClient } from "shared/api/queryClient";
import { homeHeroOptions, homeWindowOptions } from "./homeQueries";
import { shuffled } from "./homeDiscovery";

export interface HomeShelf {
  title: string;
  libraryID: string;
  dir: string;
  link: string;
}

export function useHomeDiscovery(settings: UserSettings) {
  const scope = useActiveServerScope();
  const libraries = useLibraries();
  const mediaLibraries = useMemo(
    () => (libraries.data ?? []).filter((library) => ["movie", "show"].includes(library.type)),
    [libraries.data],
  );
  const catalog = useQueries(
    {
      queries: mediaLibraries.map((library) => homeWindowOptions(scope, library.key)),
      combine: (results) => ({
        populated: results.some(
          ({ data }) =>
            data && ((data.Metadata?.length ?? 0) > 0 || (data.totalSize ?? data.size) > 0),
        ),
        pending: results.some((result) => result.isPending),
        error: results.some((result) => result.isError),
      }),
    },
    serverQueryClient,
  );
  const catalogStatus = catalog.populated
    ? "ready"
    : libraries.isPending || catalog.pending
      ? "loading"
      : libraries.isError || catalog.error
        ? "error"
        : "empty";
  const pinned = useMemo(
    () => normalizeLibraryNavigation(mediaLibraries, settings).pinned.slice(0, 4),
    [mediaLibraries, settings],
  );
  const genres = useQueries(
    {
      queries: pinned.map((library) => ({
        ...libraryDirectoryQueryOptions(scope, `/library/sections/${library.key}/genre`),
        enabled: catalogStatus === "ready",
      })),
      combine: (results) => results.map((result) => result.data?.Directory ?? []),
    },
    serverQueryClient,
  );
  const shelves = useMemo(() => {
    return shuffled(
      pinned.flatMap((library, index) =>
        shuffled(genres[index] ?? [])
          .slice(0, 5)
          .map((genre) => {
            const dir = `/library/sections/${library.key}/genre/${genre.key}`;
            return {
              title: `${library.title} - ${genre.title}`,
              libraryID: library.key,
              dir,
              link: dir,
            };
          }),
      ),
    );
  }, [pinned, genres]);
  const heroOptions = homeHeroOptions(
    serverQueryClient,
    scope,
    pinned.map((library) => library.key),
  );
  const selection = useQuery(
    { ...heroOptions, enabled: catalogStatus === "ready" && pinned.length > 0 },
    serverQueryClient,
  );
  const hero = useQuery(
    {
      ...mediaMetadataQueryOptions(scope, selection.data ?? ""),
      enabled: catalogStatus === "ready" && Boolean(selection.data),
    },
    serverQueryClient,
  );
  const [brokenArtwork, setBrokenArtwork] = useState<string | null>(null);
  const refresh = async () => {
    setBrokenArtwork(null);
    await serverQueryClient.cancelQueries({
      queryKey: ["home", scope.serverId, scope.profileKey],
    });
    await serverQueryClient.cancelQueries({
      queryKey: ["library-directory", scope.serverId, scope.profileKey],
    });
    await libraries.refetch();
    await serverQueryClient.invalidateQueries({
      queryKey: ["home", scope.serverId, scope.profileKey],
    });
    await serverQueryClient.invalidateQueries({
      queryKey: ["library-directory", scope.serverId, scope.profileKey],
    });
  };
  return {
    shelves: catalogStatus === "ready" ? shelves : [],
    hero:
      catalogStatus === "ready" && hero.data?.ratingKey !== brokenArtwork
        ? (hero.data ?? null)
        : null,
    heroLoading:
      catalogStatus === "loading" ||
      (catalogStatus === "ready" &&
        pinned.length > 0 &&
        (selection.isPending || (Boolean(selection.data) && hero.isPending))),
    catalogStatus,
    clearHero: () => setBrokenArtwork(hero.data?.ratingKey ?? null),
    refresh,
  };
}
