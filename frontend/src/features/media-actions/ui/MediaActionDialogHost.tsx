import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { mediaMetadataQueryOptions } from "entities/media/model";
import {
  useActiveServerScope,
  useAuthSession,
  useCanManageServer,
} from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  closeMediaActionDialog,
  useMediaActionDialog,
  type MediaActionSelection,
} from "../model/mediaActionDialog";
import EditMetadataDialog from "./EditMetadataDialog";
import MatchMetadataDialog from "./MatchMetadataDialog";
import ConfirmedMediaActionDialog from "./ConfirmedMediaActionDialog";

/** Media workflows outlive virtualized cards and responsive grid regrouping. */
export function MediaActionDialogHost() {
  const selection = useMediaActionDialog((state) => state.selection);
  const scope = useActiveServerScope();
  const revision = useAuthSession((state) => state.revision);
  const ready = useAuthSession((state) => state.status === "ready");
  const allowed = useCanManageServer();
  const current = Boolean(
    selection &&
      ready &&
      (selection.kind === "watched" || allowed) &&
      selection.scope.serverId === scope.serverId &&
      selection.scope.profileKey === scope.profileKey &&
      selection.revision === revision &&
      selection.isCurrent(),
  );
  useEffect(() => {
    if (selection && !current) closeMediaActionDialog(selection);
  }, [selection, current]);
  return current && selection ? (
    <OpenedMediaActionDialog key={selection.key} selection={selection} />
  ) : null;
}

function OpenedMediaActionDialog({
  selection,
}: {
  selection: MediaActionSelection;
}) {
  const onClose = () => closeMediaActionDialog(selection);
  if (selection.kind === "watched" || selection.kind === "unmatch")
    return (
      <ConfirmedMediaActionDialog selection={selection} onClose={onClose} />
    );
  const onSaved = () => {
    if (useMediaActionDialog.getState().selection === selection)
      selection.onSaved?.();
  };
  return selection.kind === "match" ? (
    <MatchMetadataDialog
      item={selection.data}
      onClose={onClose}
      onSaved={onSaved}
    />
  ) : (
    <OpenedMetadataEditor
      selection={selection}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function OpenedMetadataEditor({
  selection,
  onClose,
  onSaved,
}: {
  selection: Extract<MediaActionSelection, { kind: "edit" }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const query = useQuery(
    mediaMetadataQueryOptions(selection.scope, selection.data.ratingKey),
    serverQueryClient,
  );
  return (
    <EditMetadataDialog
      data={query.data ?? selection.data}
      open
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
