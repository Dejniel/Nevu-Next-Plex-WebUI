import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { HOME_RESTRICTION_PROFILES } from "features/session/model";
import type { PlexHomeChange, PlexHomeMember } from "features/session/model";
import { AppDialog } from "shared/ui";

export interface HomeDialogActions {
  pending: boolean;
  error: string | null;
  change: (input: PlexHomeChange) => Promise<boolean>;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function SaveButton({
  pending,
  disabled,
  onClick,
  label = "Save",
}: {
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      variant="contained"
      disabled={pending || disabled}
      onClick={onClick}
      startIcon={pending ? <CircularProgress size={16} /> : undefined}
    >
      {label}
    </Button>
  );
}

export function PlexHomeMemberEditor({
  member,
  pending,
  error,
  change,
  onClose,
  onSaved,
}: HomeDialogActions & { member: PlexHomeMember | null }) {
  const [title, setTitle] = useState(member?.title || "");
  const [restriction, setRestriction] = useState(
    member?.restrictionProfile || "unrestricted",
  );
  const knownRestriction = HOME_RESTRICTION_PROFILES.some(
    (profile) => profile.value === restriction,
  );
  const dirty =
    !member ||
    member.title !== title.trim() ||
    member.restrictionProfile !== restriction;
  const save = async () => {
    if (
      await change({
        ...(member ? { type: "edit", member } : { type: "create" }),
        title,
        restrictionProfile: restriction,
      })
    )
      onSaved(
        member
          ? "Managed user updated."
          : "Managed user created. Choose Libraries from their menu to grant access.",
      );
  };
  return (
    <AppDialog
      open
      title={member ? `Edit ${member.title}` : "Add managed user"}
      size="compact"
      busy={pending}
      onClose={onClose}
      actions={
        <SaveButton
          pending={pending}
          disabled={!title.trim() || title.trim().length > 100 || !dirty}
          onClick={save}
        />
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <TextField
        autoFocus
        fullWidth
        label="Name"
        value={title}
        disabled={pending}
        onChange={(event) => setTitle(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 100 } }}
        sx={{ mt: 1, mb: 2 }}
      />
      <TextField
        select
        fullWidth
        label="Restriction profile"
        value={restriction}
        disabled={pending}
        onChange={(event) => setRestriction(event.target.value)}
      >
        {!knownRestriction && (
          <MenuItem value={restriction}>Custom ({restriction})</MenuItem>
        )}
        {HOME_RESTRICTION_PROFILES.map((profile) => (
          <MenuItem key={profile.value} value={profile.value}>
            {profile.label}
          </MenuItem>
        ))}
      </TextField>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Plex applies the selected age restrictions. Library access is managed
        separately.
      </Typography>
    </AppDialog>
  );
}

export function PlexHomePinEditor({
  member,
  pending,
  error,
  change,
  onClose,
  onSaved,
}: HomeDialogActions & { member: PlexHomeMember }) {
  const [pin, setPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const needsCurrent = member.protected && !member.restricted;
  const save = async (remove: boolean) => {
    const input: PlexHomeChange = {
      type: "pin",
      member,
      pin: remove ? "" : pin,
      currentPin,
    };
    setPin("");
    setCurrentPin("");
    if (await change(input)) onSaved(remove ? "PIN removed." : "PIN saved.");
  };
  const pinField = (
    label: string,
    value: string,
    update: (value: string) => void,
    autoFocus: boolean,
  ) => (
    <TextField
      fullWidth
      autoFocus={autoFocus}
      label={label}
      type="password"
      value={value}
      disabled={pending}
      autoComplete="off"
      onChange={(event) =>
        update(event.target.value.replace(/\D/g, "").slice(0, 4))
      }
      slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 4 } }}
      sx={{ mt: 1, mb: 2 }}
    />
  );
  return (
    <AppDialog
      open
      title={`PIN for ${member.title}`}
      size="compact"
      busy={pending}
      onClose={onClose}
      actions={
        <>
          {member.protected && (
            <Button
              color="error"
              disabled={pending || (needsCurrent && currentPin.length !== 4)}
              onClick={() => save(true)}
            >
              Remove PIN
            </Button>
          )}
          <SaveButton
            pending={pending}
            disabled={
              pin.length !== 4 || (needsCurrent && currentPin.length !== 4)
            }
            onClick={() => save(false)}
          />
        </>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {needsCurrent && pinField("Current PIN", currentPin, setCurrentPin, true)}
      {pinField("New four-digit PIN", pin, setPin, !needsCurrent)}
      <Typography variant="body2" color="text.secondary">
        The PIN is saved by Plex. Nevu does not store it.
      </Typography>
    </AppDialog>
  );
}

export function PlexHomeInviteEditor({
  pending,
  error,
  change,
  onClose,
  onSaved,
}: HomeDialogActions) {
  const [account, setAccount] = useState("");
  return (
    <AppDialog
      open
      title="Invite to Plex Home"
      size="compact"
      busy={pending}
      onClose={onClose}
      actions={
        <SaveButton
          pending={pending}
          disabled={!account.trim()}
          label="Send invitation"
          onClick={async () => {
            if (await change({ type: "invite", account }))
              onSaved("Plex Home invitation sent.");
          }}
        />
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <TextField
        autoFocus
        fullWidth
        label="Plex email or username"
        value={account}
        disabled={pending}
        autoComplete="off"
        onChange={(event) => setAccount(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 254 } }}
        sx={{ mt: 1 }}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Home members can switch between profiles. Protect your administrator
        profile with a PIN.
      </Typography>
    </AppDialog>
  );
}
