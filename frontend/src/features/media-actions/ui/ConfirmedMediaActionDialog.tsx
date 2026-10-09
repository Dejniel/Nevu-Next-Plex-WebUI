import { ConfirmDialog } from "shared/ui";
import type { ConfirmedMediaAction } from "../model/mediaActionDialog";
import { useConfirmedMediaAction } from "../model/useConfirmedMediaAction";

export default function ConfirmedMediaActionDialog({
  selection,
  onClose,
}: {
  selection: ConfirmedMediaAction;
  onClose: () => void;
}) {
  const action = useConfirmedMediaAction(selection, onClose);
  const label =
    selection.kind === "watched" && selection.watched ? "watched" : "unwatched";
  const items =
    selection.kind === "watched"
      ? selection.items.filter((item) => action.ids.includes(item.ratingKey))
      : [];
  const noun = items.every((item) => item.type === "episode")
    ? "episode"
    : "item";
  const subject =
    selection.kind === "watched" && selection.items.length === 1
      ? `"${items[0].title}"`
      : `${items.length} ${noun}${items.length === 1 ? "" : "s"}`;
  return (
    <ConfirmDialog
      open
      title={
        selection.kind === "unmatch" ? "Unmatch metadata" : `Mark as ${label}`
      }
      message={
        selection.kind === "unmatch"
          ? `Remove the current metadata match from "${selection.data.title}"?`
          : `Are you sure you want to mark ${subject} as ${label}?`
      }
      onClose={onClose}
      onConfirm={() => void action.confirm()}
      busy={action.busy}
      error={action.error}
      confirmLabel={action.error ? "Retry" : "Confirm"}
      busyLabel={selection.kind === "unmatch" ? "Unmatching…" : "Updating…"}
    />
  );
}
