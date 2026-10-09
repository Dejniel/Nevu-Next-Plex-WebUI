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
  useMetadataDialog,
  type MetadataSelection,
} from "../model/metadataDialog";
import EditMetadataDialog from "./EditMetadataDialog";

/** The editor outlives virtualized cards and responsive grid regrouping. */
export function MetadataDialogHost() {
  const selection = useMetadataDialog((state) => state.selection);
  const scope = useActiveServerScope();
  const revision = useAuthSession((state) => state.revision);
  const ready = useAuthSession((state) => state.status === "ready");
  const allowed = useCanManageServer();
  const current = Boolean(
    selection &&
      ready &&
      allowed &&
      selection.scope.serverId === scope.serverId &&
      selection.scope.profileKey === scope.profileKey &&
      selection.revision === revision,
  );
  useEffect(() => {
    if (selection && !current) useMetadataDialog.setState({ selection: null });
  }, [selection, current]);
  return current && selection ? (
    <OpenedMetadataDialog
      key={`${selection.scope.serverId}:${selection.scope.profileKey}:${selection.revision}:${selection.data.ratingKey}`}
      selection={selection}
    />
  ) : null;
}

function OpenedMetadataDialog({ selection }: { selection: MetadataSelection }) {
  const query = useQuery(
    mediaMetadataQueryOptions(selection.scope, selection.data.ratingKey),
    serverQueryClient,
  );
  return (
    <EditMetadataDialog
      data={query.data ?? selection.data}
      open
      onClose={() => {
        if (useMetadataDialog.getState().selection === selection)
          useMetadataDialog.setState({ selection: null });
      }}
      onSaved={() => {
        if (useMetadataDialog.getState().selection === selection)
          selection.onSaved?.();
      }}
    />
  );
}
