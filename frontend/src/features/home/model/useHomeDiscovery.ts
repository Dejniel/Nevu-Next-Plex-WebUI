import { useEffect, useRef, useState } from "react";
import type { UserSettings } from "features/settings/model";
import { normalizeLibraryNavigation } from "features/library-navigation/model";
import {
  getHomeGenres,
  getHomeLibraries,
  getHomeLibraryWindow,
  getHomeMetadata,
} from "../api/home";
import {
  hasHeroArtwork,
  heroCandidates,
  randomLibraryWindow,
  shuffled,
} from "./homeDiscovery";

const HERO_WINDOW_SIZE = 8;
const HOME_LIBRARY_LIMIT = 4;
const GENRES_PER_LIBRARY = 5;

type HomeLibrary = Pick<Plex.LibarySection, "key" | "title">;

export interface HomeShelf {
  title: string;
  libraryID: string;
  dir: string;
  link: string;
}

interface HomeDiscoveryState {
  shelves: HomeShelf[];
  hero: Plex.Metadata | null;
  heroLoading: boolean;
}

export function useHomeDiscovery(settings: UserSettings) {
  const generation = useRef(0);
  const [state, setState] = useState<HomeDiscoveryState>({
    shelves: [],
    hero: null,
    heroLoading: true,
  });

  useEffect(() => {
    const request = ++generation.current;
    setState((current) => ({ ...current, hero: null, heroLoading: true }));

    void getHomeLibraries()
      .then((allLibraries) => {
        if (generation.current !== request) return;
        const libraries = normalizeLibraryNavigation(
          allLibraries.filter((library) =>
            ["movie", "show"].includes(library.type),
          ),
          settings,
        ).pinned.slice(0, HOME_LIBRARY_LIMIT);

        void loadHomeShelves(libraries)
          .then((shelves) => {
            if (generation.current === request)
              setState((current) => ({ ...current, shelves }));
          })
          .catch((error) => console.error("Unable to load home shelves", error));

        void loadHomeHero(libraries)
          .then((hero) => {
            if (generation.current === request)
              setState((current) => ({
                ...current,
                hero,
                heroLoading: false,
              }));
          })
          .catch((error) => {
            console.error("Unable to load the home hero", error);
            if (generation.current === request)
              setState((current) => ({ ...current, heroLoading: false }));
          });
      })
      .catch((error) => {
        console.error("Unable to load home libraries", error);
        if (generation.current === request)
          setState((current) => ({ ...current, heroLoading: false }));
      });

    return () => {
      generation.current += 1;
    };
  }, [settings]);

  const clearHero = () =>
    setState((current) => ({ ...current, hero: null }));

  return { ...state, clearHero };
}

async function loadHomeShelves(
  libraries: HomeLibrary[],
): Promise<HomeShelf[]> {
  const shelves: HomeShelf[] = [];

  for (const library of libraries) {
    const genres = await getHomeGenres(library.key);
    for (const genre of shuffled(genres).slice(0, GENRES_PER_LIBRARY)) {
      const dir = `/library/sections/${library.key}/genre/${genre.key}`;
      shelves.push({
        title: `${library.title} - ${genre.title}`,
        libraryID: library.key,
        dir,
        link: dir,
      });
    }
  }

  return shuffled(shelves);
}

async function loadHomeHero(libraries: HomeLibrary[]) {
  for (const library of shuffled(libraries)) {
    try {
      const summary = await getHomeLibraryWindow(library.key, 0, 0);
      const window = randomLibraryWindow(
        summary.totalSize ?? summary.size,
        HERO_WINDOW_SIZE,
      );
      if (!window) continue;

      const first = await getHomeLibraryWindow(
        library.key,
        window.start,
        window.size,
      );
      let items = first.Metadata || [];
      if (window.wrapSize) {
        const wrapped = await getHomeLibraryWindow(
          library.key,
          0,
          window.wrapSize,
        );
        items = [...items, ...(wrapped.Metadata || [])];
      }

      for (const candidate of heroCandidates(items)) {
        const metadata = await getHomeMetadata(candidate.ratingKey);
        if (hasHeroArtwork(metadata)) return metadata;
      }
    } catch (error) {
      console.warn(
        `Unable to select a home hero from library ${library.key}`,
        error,
      );
    }
  }
  return null;
}
