export interface PlexPreference {
  id: string;
  label: string;
  summary: string;
  type: string;
  value: string;
  default: string;
  choices: Array<{ value: string; label: string }>;
  group: string;
  advanced: boolean;
}

export type PreferenceChanges = Record<string, string>;

export function normalizePlexPreferences(settings: unknown): PlexPreference[];
export function preferenceValue(type: string, value: unknown): string;
export function preferenceValueError(
  preference: PlexPreference,
  value: unknown,
): string | undefined;
export function preferenceChanges(
  preferences: readonly PlexPreference[],
  draft: PreferenceChanges,
): PreferenceChanges;
export function validatePreferenceChanges(
  preferences: readonly PlexPreference[],
  input: unknown,
): PreferenceChanges;
