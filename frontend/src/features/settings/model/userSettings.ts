import { create } from "zustand";
import { loadUserSettings, saveUserSetting } from "../api/userSettings";

export type UserSettingsStatus = "idle" | "loading" | "ready" | "error";
export type UserSettings = Record<string, string>;

export const defaultUserSettings: UserSettings = {
  DISABLE_WATCHSCREEN_DARKENING: "false",
  AUTO_MATCH_TRACKS: "true",
  AUTO_NEXT_EP: "true",
  LIBRARY_CARD_LAYOUT: "landscape",
  LIBRARY_CARD_SIZE: "40",
};

const SETTINGS_CACHE_VERSION = 1;
const SETTINGS_CACHE_PREFIX = `nevu.userSettings.v${SETTINGS_CACHE_VERSION}`;

export const userSettingsCacheKey = (profileKey: string) =>
  `${SETTINGS_CACHE_PREFIX}:${encodeURIComponent(profileKey)}`;

function parseSettings(value: unknown): UserSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string"
    ),
  );
}

function readCachedSettings(profileKey: string): UserSettings {
  try {
    return parseSettings(
      JSON.parse(localStorage.getItem(userSettingsCacheKey(profileKey)) || "{}"),
    );
  } catch {
    return {};
  }
}

function cacheSettings(profileKey: string, settings: UserSettings) {
  try {
    localStorage.setItem(
      userSettingsCacheKey(profileKey),
      JSON.stringify(settings),
    );
  } catch {
    // An unavailable cache must not break profile initialization.
  }
}

interface UserSettingsState {
  status: UserSettingsStatus;
  profileKey: string | null;
  settings: UserSettings;
  error: string | null;
  initialize: (profileKey: string) => Promise<void>;
  setSetting: (key: string, value: string) => Promise<boolean>;
  reset: () => void;
}

let loadGeneration = 0;
const writeGenerations = new Map<string, number>();

export const useUserSettings = create<UserSettingsState>((set, get) => ({
  status: "idle",
  profileKey: null,
  settings: { ...defaultUserSettings },
  error: null,

  initialize: async (profileKey) => {
    const current = get();
    if (
      current.profileKey === profileKey &&
      (current.status === "loading" || current.status === "ready")
    ) {
      return;
    }

    const generation = ++loadGeneration;
    const cached = readCachedSettings(profileKey);

    set({
      status: "loading",
      profileKey,
      settings: { ...defaultUserSettings, ...cached },
      error: null,
    });

    try {
      const loadedSettings = await loadUserSettings();
      if (generation !== loadGeneration || get().profileKey !== profileKey)
        return;

      const settings = {
        ...defaultUserSettings,
        ...loadedSettings,
      };
      cacheSettings(profileKey, settings);
      set({ status: "ready", settings, error: null });
    } catch {
      if (generation !== loadGeneration || get().profileKey !== profileKey)
        return;
      set({
        status: "error",
        error: "User settings could not be refreshed. Cached settings are being used.",
      });
    }
  },

  setSetting: async (key, value) => {
    const { profileKey, settings } = get();
    if (profileKey === null) return false;

    const previousValue = settings[key];
    const writeGeneration = (writeGenerations.get(key) || 0) + 1;
    writeGenerations.set(key, writeGeneration);

    const optimisticSettings = { ...settings, [key]: value };
    set({ settings: optimisticSettings, error: null });
    cacheSettings(profileKey, optimisticSettings);

    try {
      await saveUserSetting(key, value);
      return true;
    } catch {
      if (
        get().profileKey === profileKey &&
        writeGenerations.get(key) === writeGeneration
      ) {
        const rolledBack = { ...get().settings };
        if (previousValue === undefined) delete rolledBack[key];
        else rolledBack[key] = previousValue;
        set({
          settings: rolledBack,
          error: `Failed to save setting: ${key}`,
        });
        cacheSettings(profileKey, rolledBack);
      }
      return false;
    }
  },

  reset: () => {
    loadGeneration += 1;
    writeGenerations.clear();
    set({
      status: "idle",
      profileKey: null,
      settings: { ...defaultUserSettings },
      error: null,
    });
  },
}));
