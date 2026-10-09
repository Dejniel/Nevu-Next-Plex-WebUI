import { create } from "zustand";
import type { MediaScope } from "entities/media/model";
import {
  canManageServer,
  getActiveServerScope,
  useAuthSession,
  useServerSession,
} from "features/session/model";

export interface MetadataSelection {
  data: Plex.Metadata;
  scope: MediaScope;
  revision: number;
  onSaved?: () => void;
}

export const useMetadataDialog = create<{
  selection: MetadataSelection | null;
}>(() => ({ selection: null }));

export function openMetadataDialog(data: Plex.Metadata, onSaved?: () => void) {
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
      selection: { data, scope, revision, onSaved },
    });
}
