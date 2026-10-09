import {
  DeleteOutlineRounded,
  EditRounded,
  MoreVertRounded,
} from "@mui/icons-material";
import {
  Alert,
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type { MediaScope } from "entities/media/model";
import { AppDialog } from "shared/ui";
import type { PlaylistEdit } from "../api/playlistEditing";
import type { MediaListEntry, MediaListSummary } from "../model/mediaLists";
import { usePlaylistEditing } from "../model/usePlaylistEditing";

export type PlaylistAction =
  | { type: "details" | "delete" }
  | { type: "move" | "remove"; entry: MediaListEntry };

export default function PlaylistEditor({
  playlist,
  total,
  scope,
  selected,
  onSelect,
  onClose,
  onDeleted,
}: {
  playlist: MediaListSummary;
  total: number;
  scope: MediaScope;
  selected: PlaylistAction | null;
  onSelect: (action: PlaylistAction) => void;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const noun = playlist.playlistType === "photo" ? "album" : "playlist";
  const name = playlist.playlistType === "photo" ? "Album" : "Playlist";
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton
        aria-label={`${name} actions`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreVertRounded />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onSelect({ type: "details" });
          }}
        >
          <ListItemIcon>
            <EditRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>{`Edit ${noun}…`}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onSelect({ type: "delete" });
          }}
        >
          <ListItemIcon>
            <DeleteOutlineRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>{`Delete ${noun}…`}</ListItemText>
        </MenuItem>
      </Menu>
      {selected && (
        <PlaylistEditDialog
          key={`${selected.type}:${"entry" in selected ? selected.entry.playlistItemID : ""}`}
          action={selected}
          playlist={playlist}
          total={total}
          scope={scope}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}

function PlaylistEditDialog({
  action,
  playlist,
  total,
  scope,
  onClose,
  onDeleted,
}: {
  action: PlaylistAction;
  playlist: MediaListSummary;
  total: number;
  scope: MediaScope;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const noun = playlist.playlistType === "photo" ? "album" : "playlist";
  const name = playlist.playlistType === "photo" ? "Album" : "Playlist";
  const [title, setTitle] = useState(playlist.title);
  const [summary, setSummary] = useState(playlist.summary);
  const [position, setPosition] = useState(
    "entry" in action ? String(action.entry.position + 1) : "1",
  );
  const mutation = usePlaylistEditing(playlist.id, scope);
  const moving = action.type === "move";
  const destructive = action.type === "remove" || action.type === "delete";
  const number = Number(position);
  const valid =
    action.type === "details"
      ? Boolean(title.trim())
      : !moving ||
        (Number.isSafeInteger(number) &&
          number >= 1 &&
          number <= total &&
          number !== action.entry.position + 1);
  const label =
    action.type === "details"
      ? "Save"
      : moving
        ? "Move"
        : action.type === "remove"
          ? "Remove"
          : `Delete ${noun}`;
  const submit = () => {
    if (!valid || mutation.isPending) return;
    const edit: PlaylistEdit =
      action.type === "details"
        ? { type: "details", title, summary }
        : action.type === "move"
          ? { type: "move", entry: action.entry, position: number - 1, total }
          : action.type === "remove"
            ? { type: "remove", entry: action.entry }
            : { type: "delete" };
    mutation.mutate(edit, {
      onSuccess: () => {
        if (action.type === "delete") onDeleted();
        onClose();
      },
    });
  };
  return (
    <AppDialog
      open
      size="compact"
      busy={mutation.isPending}
      onClose={onClose}
      title={
        action.type === "details"
          ? `Edit ${noun}`
          : moving
            ? `Move ${noun} item`
            : action.type === "remove"
              ? `Remove from ${noun}?`
              : `Delete ${noun}?`
      }
      actions={
        <>
          <Button disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={destructive ? "error" : "primary"}
            disabled={!valid || mutation.isPending}
            onClick={submit}
          >
            {mutation.isPending ? "Saving…" : label}
          </Button>
        </>
      }
    >
      <Stack
        component="form"
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {mutation.error && (
          <Alert severity="error">{mutation.error.message}</Alert>
        )}
        {action.type === "details" ? (
          <>
            <TextField
              autoFocus
              fullWidth
              label={`${name} name`}
              value={title}
              disabled={mutation.isPending}
              onChange={(event) => setTitle(event.target.value)}
            />
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Description"
              value={summary}
              disabled={mutation.isPending}
              onChange={(event) => setSummary(event.target.value)}
            />
            {playlist.smart && (
              <Typography variant="body2" color="text.secondary">
                Items in this smart {noun} are managed by its filters in Plex.
              </Typography>
            )}
          </>
        ) : moving ? (
          <>
            <Typography sx={{ overflowWrap: "anywhere" }}>
              {action.entry.item.title}
            </Typography>
            <TextField
              autoFocus
              fullWidth
              label="Position"
              type="number"
              value={position}
              disabled={mutation.isPending}
              onChange={(event) => setPosition(event.target.value)}
              slotProps={{ htmlInput: { min: 1, max: total, step: 1 } }}
              helperText={`Choose a position from 1 to ${total}.`}
            />
            <Stack direction="row" spacing={1}>
              <Button
                disabled={mutation.isPending || number === 1}
                onClick={() => setPosition("1")}
              >
                First
              </Button>
              <Button
                disabled={mutation.isPending || number === total}
                onClick={() => setPosition(String(total))}
              >
                Last
              </Button>
            </Stack>
          </>
        ) : (
          <Typography sx={{ overflowWrap: "anywhere" }}>
            {action.type === "remove"
              ? `Remove “${action.entry.item.title}” (position ${action.entry.position + 1}) from “${playlist.title}”? The item stays in your library.`
              : `Delete “${playlist.title}” for this profile? Items in your library will be kept.`}
          </Typography>
        )}
      </Stack>
    </AppDialog>
  );
}
