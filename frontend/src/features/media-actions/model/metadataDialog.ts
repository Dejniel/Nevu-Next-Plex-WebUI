import { create } from "zustand";
import type { MediaScope, MediaItemData } from "entities/media/model";
import { metadataMatchType } from "./matching";
import {
  canManageServer,
  getActiveServerScope,
  useAuthSession,
  useServerSession,
} from "features/session/model";

interface MetadataSelectionScope {
  scope: MediaScope;
  revision: number;
  onSaved?: () => void;
}
export type MetadataSelection = MetadataSelectionScope &
  (
    | { kind: "edit"; data: Plex.Metadata }
    | { kind: "match"; data: MediaItemData }
  );

export const useMetadataDialog = create<{
  selection: MetadataSelection | null;
}>(() => ({ selection: null }));

function openDialog(
  selection: Pick<MetadataSelectionScope, "onSaved"> &
    (
      | { kind: "edit"; data: Plex.Metadata }
      | { kind: "match"; data: MediaItemData }
    ),
) {
  const scope = getActiveServerScope();
  const { revision, status, activeUser } = useAuthSession.getState();
  if (
    scope &&
    status === "ready" &&
    canManageServer(
      Boolean(activeUser && !activeUser.restricted),
      useServerSession.getState().canManageServer,
    )
  )
    useMetadataDialog.setState({
      selection: { ...selection, scope, revision },
    });
}

export function openMetadataDialog(data: Plex.Metadata, onSaved?: () => void) {
  openDialog({ kind: "edit", data, onSaved });
}

export function openMetadataMatchDialog(
  data: MediaItemData,
  onSaved?: () => void,
) {
  if (
    /^\d+$/.test(data.ratingKey) &&
    metadataMatchType(data.type) !== undefined
  )
    openDialog({ kind: "match", data, onSaved });
}
