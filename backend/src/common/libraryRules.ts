export const LIBRARY_PRESETS = {
    movie: { plexType: 1, scanner: 'Plex Movie', agent: 'tv.plex.agents.movie' },
    show: { plexType: 2, scanner: 'Plex TV Series', agent: 'tv.plex.agents.series' },
    artist: { plexType: 8, scanner: 'Plex Music', agent: 'tv.plex.agents.music' },
    photo: { plexType: 13, scanner: 'Plex Photo Scanner', agent: 'com.plexapp.agents.none' },
    video: { plexType: 1, scanner: 'Plex Video Files Scanner', agent: 'com.plexapp.agents.none' },
} as const;

export type LibraryKind = keyof typeof LIBRARY_PRESETS;

export function sectionId(value: string) {
    return /^\d+$/.test(value) ? value : null;
}

export function libraryName(value: unknown) {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    return name.length > 0 && name.length <= 100 ? name : null;
}

export function libraryLanguage(value: unknown) {
    if (typeof value !== 'string') return null;
    const language = value.trim();
    return /^[A-Za-z0-9_-]{2,16}$/.test(language) ? language : null;
}

export function libraryLocations(value: unknown) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;
    const locations = value.map((entry) => typeof entry === 'string' ? entry.trim() : '');
    if (locations.some((path) =>
        !path || path.length > 2048 ||
        (!path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path) && !path.startsWith('\\\\'))
    )) return null;
    return [...new Set(locations)];
}

export function libraryKind(value: unknown): LibraryKind | null {
    return typeof value === 'string' && value in LIBRARY_PRESETS
        ? value as LibraryKind
        : null;
}
