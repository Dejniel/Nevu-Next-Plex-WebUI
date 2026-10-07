import {
  AddRounded,
  LockOutlined,
  MoreVertRounded,
  PersonAddAltRounded,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useAuthSession, useCanManageServer } from "features/session/public";
import {
  HOME_RESTRICTION_PROFILES,
  homeMemberActions,
} from "features/session/model";
import type {
  PlexHomeChange,
  PlexHomeInvite,
  PlexHomeMember,
} from "features/session/model";
import { AppDialog, ConfirmDialog } from "shared/ui";
import { usePlexHome } from "../model/usePlexHome";
import { useSharingOverview } from "../model/useSharing";
import {
  PlexHomeInviteEditor,
  PlexHomeMemberEditor,
  PlexHomePinEditor,
} from "./PlexHomeDialogs";
import ShareEditor from "./ShareEditor";

type HomeDialog =
  | { type: "edit"; member: PlexHomeMember | null }
  | { type: "pin" | "remove" | "libraries"; member: PlexHomeMember }
  | { type: "invite" }
  | { type: "invitation"; invite: PlexHomeInvite; accept: boolean }
  | { type: "guest" };

function HomeLibraries({
  member,
  onClose,
  onSaved,
}: {
  member: PlexHomeMember;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const overview = useSharingOverview(true);
  if (!overview.data)
    return (
      <AppDialog
        open
        title={`Libraries for ${member.title}`}
        size="compact"
        onClose={onClose}
      >
        {overview.error ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={() => overview.refetch()}>
                Retry
              </Button>
            }
          >
            {overview.error.message}
          </Alert>
        ) : (
          <CircularProgress size={24} />
        )}
      </AppDialog>
    );
  return (
    <ShareEditor
      open
      recipient={member}
      share={
        overview.data.shares.find((share) => share.userId === member.id) || null
      }
      libraries={overview.data.libraries}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

export default function SettingsPlexHome() {
  const revision = useAuthSession((state) => state.revision);
  return <PlexHomeSettings key={revision} />;
}

function PlexHomeSettings() {
  const { activeProfile } = useAuthSession();
  const canManageServer = useCanManageServer();
  const home = usePlexHome();
  const [dialog, setDialog] = useState<HomeDialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    anchor: HTMLElement;
    member: PlexHomeMember;
  } | null>(null);
  const overview = home.data;
  const activeId = activeProfile?.id || 0;
  const atLimit =
    overview?.maxSize !== null &&
    overview?.maxSize !== undefined &&
    overview.members.length >= overview.maxSize;
  const close = () => {
    setDialog(null);
    home.clearError();
  };
  const saved = (message: string) => {
    close();
    setNotice(message);
  };
  const open = (next: HomeDialog) => {
    home.clearError();
    setDialog(next);
    setMenu(null);
  };
  const confirmation = homeConfirmation(dialog, activeId);
  const actions = {
    pending: home.pending,
    error: home.mutationError,
    change: home.change,
    onClose: close,
    onSaved: saved,
  };
  const menuActions =
    menu && overview
      ? homeMemberActions(menu.member, activeId, overview.canManage)
      : null;
  const confirm = async (change: PlexHomeChange, message: string) => {
    if (await home.change(change)) saved(message);
  };

  return (
    <Box sx={{ width: "100%", minWidth: 0 }}>
      <Typography variant="h4">Plex Home</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        Manage household profiles and access to them.
      </Typography>
      {home.error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={() => home.refetch()}>
              Retry
            </Button>
          }
        >
          {home.error.message}
        </Alert>
      )}
      {home.isPending ? (
        <CircularProgress size={28} />
      ) : (
        overview && (
          <>
            {overview.canManage ? (
              <>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                  <Button
                    variant="contained"
                    startIcon={<AddRounded />}
                    disabled={home.pending || atLimit}
                    onClick={() => open({ type: "edit", member: null })}
                  >
                    Add managed user
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<PersonAddAltRounded />}
                    disabled={home.pending || atLimit || !overview.canInvite}
                    onClick={() => open({ type: "invite" })}
                  >
                    Invite Plex user
                  </Button>
                </Box>
                {!overview.canInvite && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                  >
                    Inviting full Plex accounts requires Plex Pass.
                  </Typography>
                )}
                {!overview.members.find((member) => member.admin)
                  ?.protected && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Set a PIN on the Home administrator profile to protect
                    access to settings.
                  </Alert>
                )}
              </>
            ) : (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                The Home administrator manages members. You can change the PIN
                for your own Plex account.
              </Typography>
            )}
            <Typography
              variant="body2"
              color={atLimit ? "warning.main" : "text.secondary"}
            >
              {overview.members.length}
              {overview.maxSize ? ` / ${overview.maxSize}` : ""} members
              {atLimit ? " · Member limit reached" : ""}
            </Typography>
            <Box sx={{ mt: 1 }}>
              {overview.members.map((member) => {
                const permissions = homeMemberActions(
                  member,
                  activeId,
                  overview.canManage,
                );
                const restriction =
                  HOME_RESTRICTION_PROFILES.find(
                    (profile) => profile.value === member.restrictionProfile,
                  )?.label || member.restrictionProfile;
                const hasActions =
                  permissions.edit ||
                  permissions.pin ||
                  permissions.remove ||
                  (canManageServer && overview.canManage && !member.admin);
                return (
                  <Box
                    key={member.id}
                    sx={{
                      display: "flex",
                      gap: 1.5,
                      alignItems: "center",
                      py: 2,
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Avatar
                      src={member.thumb}
                      alt={member.title}
                      sx={{ width: 44, height: 44 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <Typography
                          sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                        >
                          {member.title}
                        </Typography>
                        {member.id === activeId && (
                          <Chip label="You" size="small" />
                        )}
                        {member.protected && (
                          <Tooltip title="PIN protected">
                            <LockOutlined
                              fontSize="small"
                              aria-label="PIN protected"
                            />
                          </Tooltip>
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {member.admin
                          ? "Home administrator"
                          : member.guest
                            ? "Guest"
                            : member.restricted
                              ? "Managed user"
                              : "Plex account"}
                        {member.restricted &&
                        member.restrictionProfile !== "unrestricted"
                          ? ` · ${restriction}`
                          : ""}
                      </Typography>
                    </Box>
                    {hasActions && (
                      <IconButton
                        aria-label={`Actions for ${member.title}`}
                        disabled={home.pending}
                        onClick={(event) =>
                          setMenu({ anchor: event.currentTarget, member })
                        }
                      >
                        <MoreVertRounded />
                      </IconButton>
                    )}
                  </Box>
                );
              })}
            </Box>
            {overview.canManage && (
              <FormControlLabel
                sx={{ mt: 2 }}
                control={
                  <Switch
                    checked={overview.guestEnabled}
                    disabled={
                      home.pending || (!overview.guestEnabled && atLimit)
                    }
                    onChange={(_, enabled) =>
                      enabled
                        ? confirm(
                            { type: "guest", enabled },
                            "Guest profile enabled.",
                          )
                        : open({ type: "guest" })
                    }
                  />
                }
                label="Enable guest profile"
              />
            )}
            {overview.invites.length > 0 && (
              <>
                <Typography variant="h6" sx={{ mt: 3 }}>
                  Home invitations
                </Typography>
                {overview.invites.map((invite) => (
                  <Box
                    key={`${invite.incoming}:${invite.id}`}
                    sx={{
                      py: 2,
                      display: "flex",
                      gap: 1,
                      flexWrap: "wrap",
                      alignItems: "center",
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Box sx={{ flex: "1 1 160px", minWidth: 0 }}>
                      <Typography sx={{ overflowWrap: "anywhere" }}>
                        {invite.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {invite.incoming
                          ? "Invited you to their Home"
                          : "Invitation pending"}
                      </Typography>
                    </Box>
                    {invite.incoming && (
                      <Button
                        disabled={home.pending}
                        onClick={() =>
                          open({ type: "invitation", invite, accept: true })
                        }
                      >
                        Accept
                      </Button>
                    )}
                    <Button
                      color="error"
                      disabled={home.pending}
                      onClick={() =>
                        open({ type: "invitation", invite, accept: false })
                      }
                    >
                      {invite.incoming ? "Decline" : "Cancel invitation"}
                    </Button>
                  </Box>
                ))}
              </>
            )}
            {!dialog && home.mutationError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {home.mutationError}
              </Alert>
            )}
          </>
        )
      )}

      <Menu
        anchorEl={menu?.anchor}
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
      >
        {menu && menuActions?.edit && (
          <MenuItem onClick={() => open({ type: "edit", member: menu.member })}>
            Edit managed user
          </MenuItem>
        )}
        {menu && menuActions?.pin && (
          <MenuItem onClick={() => open({ type: "pin", member: menu.member })}>
            {menu.member.protected ? "Change PIN" : "Set PIN"}
          </MenuItem>
        )}
        {menu &&
          overview?.canManage &&
          canManageServer &&
          !menu.member.admin && (
            <MenuItem
              onClick={() => open({ type: "libraries", member: menu.member })}
            >
              Libraries
            </MenuItem>
          )}
        {menu && menuActions?.remove && (
          <MenuItem
            sx={{ color: "error.main" }}
            onClick={() => open({ type: "remove", member: menu.member })}
          >
            {menuActions.leave ? "Leave Plex Home" : "Remove from Home"}
          </MenuItem>
        )}
      </Menu>
      {dialog?.type === "edit" && (
        <PlexHomeMemberEditor
          key={dialog.member?.id || "new"}
          member={
            overview?.members.find(
              (member) => member.id === dialog.member?.id,
            ) || dialog.member
          }
          {...actions}
        />
      )}
      {dialog?.type === "pin" && (
        <PlexHomePinEditor member={dialog.member} {...actions} />
      )}
      {dialog?.type === "invite" && <PlexHomeInviteEditor {...actions} />}
      {dialog?.type === "libraries" && (
        <HomeLibraries member={dialog.member} onClose={close} onSaved={saved} />
      )}
      {confirmation && (
        <ConfirmDialog
          open
          busy={home.pending}
          error={home.mutationError}
          onClose={close}
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.label}
          confirmColor={
            confirmation.change.type === "invitation" &&
            confirmation.change.accept
              ? "primary"
              : "error"
          }
          onConfirm={() => confirm(confirmation.change, confirmation.notice)}
        />
      )}
      <Snackbar
        open={Boolean(notice)}
        message={notice}
        autoHideDuration={5000}
        onClose={() => setNotice(null)}
      />
    </Box>
  );
}

function homeConfirmation(
  dialog: HomeDialog | null,
  activeId: number,
): {
  title: string;
  message: string;
  label: string;
  notice: string;
  change: PlexHomeChange;
} | null {
  if (dialog?.type === "guest")
    return {
      title: "Disable guest profile?",
      message: "Guests will no longer be able to select this profile.",
      label: "Disable",
      notice: "Guest profile disabled.",
      change: { type: "guest", enabled: false },
    };
  if (dialog?.type === "invitation")
    return {
      title: dialog.accept ? "Join this Plex Home?" : "Remove Home invitation?",
      message: dialog.accept
        ? "You will join this household and gain access to its shared profiles. Plex determines whether your current Home membership permits joining."
        : "This removes the Home invitation only. Existing library sharing is preserved.",
      label: dialog.accept
        ? "Join Home"
        : dialog.invite.incoming
          ? "Decline"
          : "Cancel invitation",
      notice: dialog.accept
        ? "Home invitation accepted."
        : "Home invitation removed.",
      change: {
        type: "invitation",
        invite: dialog.invite,
        accept: dialog.accept,
      },
    };
  if (dialog?.type !== "remove") return null;
  const own = dialog.member.id === activeId;
  return {
    title: own ? "Leave Plex Home?" : `Remove ${dialog.member.title}?`,
    message: dialog.member.restricted
      ? "This deletes the managed user and their profile data from Plex. This cannot be undone."
      : own
        ? "You will lose access to this Home's managed profiles and shared Home benefits."
        : "This removes the account from your Home. It does not delete their Plex account.",
    label: own ? "Leave Home" : "Remove",
    notice: "Home membership removed.",
    change: { type: "remove", member: dialog.member },
  };
}
