import { useState } from "react";
import {
  preferenceChanges,
  preferenceValue,
  type PlexPreference,
  type PreferenceChanges,
} from "@nevu/contracts";

export function usePreferenceDraft(preferences: readonly PlexPreference[]) {
  const [draft, setDraft] = useState<PreferenceChanges>({});
  return {
    draft,
    changes: preferenceChanges(preferences, draft),
    setValue: (id: string, value: string) =>
      setDraft((current) => {
        const preference = preferences.find((setting) => setting.id === id);
        if (!preference) return current;
        const next = { ...current, [id]: value };
        if (preferenceValue(preference.type, value) === preference.value)
          delete next[id];
        return next;
      }),
    reset: () => setDraft({}),
  };
}
