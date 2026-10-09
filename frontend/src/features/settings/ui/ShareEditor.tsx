import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { AppDialog } from "shared/ui";
import { useAuthSession, useActiveServerScope } from "features/session/model";
import type { PlexShare, SharingLibrary } from "../api/sharing";
import { useSharingChange } from "../model/useSharing";

interface ShareEditorProps {
  open: boolean;
  share: PlexShare | null;
  libraries: SharingLibrary[];
  recipient?: { id: number; title: string };
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function ShareEditor(props: ShareEditorProps) {
  const revision = useAuthSession((state) => state.revision);
  const { serverId } = useActiveServerScope();
  if (!props.open) return null;
  return (
    <SharingForm
      key={`${serverId}:${revision}:${props.recipient?.id ?? props.share?.id ?? "new"}`}
      {...props}
    />
  );
}

function SharingForm({
  share,
  libraries,
  recipient,
  onClose,
  onSaved,
}: ShareEditorProps) {
  const [account, setAccount] = useState("");
  const [selected, setSelected] = useState<string[]>(() =>
    share?.allLibraries
      ? libraries.map((library) => library.id)
      : share?.librarySectionIds ||
        (recipient ? [] : libraries.map((library) => library.id)),
  );
  const [allowDownloads, setAllowDownloads] = useState(
    share?.allowDownloads ?? true,
  );
  const mutation = useSharingChange();
  const saving = mutation.isPending;
  const error = mutation.error?.message;

  const allSelected =
    libraries.length > 0 &&
    libraries.every((library) => selected.includes(library.id));
  const toggleLibrary = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((libraryId) => libraryId !== id)
        : [...current, id],
    );
  };

  const save = () => {
    if (
      saving ||
      (selected.length === 0 && (!recipient || !share)) ||
      (!share && !recipient && !account.trim())
    )
      return;
    const input = { librarySectionIds: selected, allowDownloads };
    mutation.mutate(
      share
        ? selected.length === 0
          ? { type: "remove", id: share.id }
          : { type: "update", id: share.id, input }
        : {
            type: "create",
            input: {
              ...input,
              ...(recipient
                ? { invitedId: recipient.id }
                : { invitedAccount: account.trim() }),
            },
          },
      {
        onSuccess: () =>
          onSaved(
            recipient || share
              ? `Updated access for ${recipient?.title || share?.displayName}.`
              : "Plex invitation sent.",
          ),
      },
    );
  };

  return (
    <AppDialog
      open
      title={
        recipient
          ? `Libraries for ${recipient.title}`
          : share
            ? `Edit ${share.displayName}`
            : "Share libraries"
      }
      onClose={onClose}
      busy={saving}
      actions={
        <Button
          variant="contained"
          onClick={save}
          disabled={
            saving ||
            (selected.length === 0 && (!recipient || !share)) ||
            (!share && !recipient && !account.trim())
          }
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {share || recipient ? "Save" : "Send invitation"}
        </Button>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {!share && !recipient && (
        <TextField
          autoFocus
          fullWidth
          required
          label="Plex email or username"
          value={account}
          disabled={saving}
          autoComplete="off"
          onChange={(event) => setAccount(event.target.value)}
          sx={{ mt: 1, mb: 2 }}
        />
      )}

      <Typography variant="subtitle2" sx={{ color: "text.secondary", mb: 0.5 }}>
        Libraries
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={allSelected}
            indeterminate={selected.length > 0 && !allSelected}
            disabled={saving}
            onChange={() =>
              setSelected(
                allSelected ? [] : libraries.map((library) => library.id),
              )
            }
          />
        }
        label="All libraries"
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        }}
      >
        {libraries.map((library) => (
          <FormControlLabel
            key={library.id}
            control={
              <Checkbox
                checked={selected.includes(library.id)}
                disabled={saving}
                onChange={() => toggleLibrary(library.id)}
              />
            }
            label={library.title}
          />
        ))}
      </Box>

      {selected.length === 0 && (
        <Typography variant="caption" color="error">
          {recipient && share
            ? "Saving will remove access to this server."
            : "Select at least one library."}
        </Typography>
      )}

      <Box
        sx={{ mt: 2, pt: 1, borderTop: "1px solid", borderColor: "divider" }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={allowDownloads}
              disabled={saving}
              onChange={(_, checked) => setAllowDownloads(checked)}
            />
          }
          label="Allow downloads"
        />
      </Box>
    </AppDialog>
  );
}
