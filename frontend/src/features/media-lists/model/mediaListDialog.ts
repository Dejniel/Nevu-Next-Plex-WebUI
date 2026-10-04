import { create } from "zustand";
import { useUserSettings } from "features/settings/model";
import type { MediaListItem } from "./mediaListEditing";
import type { MediaListKind } from "./mediaLists";

export const useMediaListDialog = create<{
  selection: {
    item: MediaListItem;
    kind: MediaListKind;
    profileKey: string;
  } | null;
}>(() => ({ selection: null }));

export function openMediaListDialog(kind: MediaListKind, item: MediaListItem) {
  const profileKey = useUserSettings.getState().profileKey;
  if (profileKey)
    useMediaListDialog.setState({ selection: { item, kind, profileKey } });
}
