import {
  DeleteOutlineRounded,
  DriveFileMoveRounded,
  EditRounded,
  ManageSearchRounded,
  MoreHorizRounded,
  PushPinOutlined,
  PushPinRounded,
  RefreshRounded,
  RestartAltRounded,
} from "@mui/icons-material";
import {
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
} from "@mui/material";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import ConfirmDialog from "components/ConfirmDialog";
import { runLibraryAction } from "entities/library/model";
import { useUserSettings } from "features/settings/model";
import {
  LIBRARY_NAVIGATION_SETTING,
  NavigationLibrary,
  normalizeLibraryNavigation,
  serializeLibraryNavigation,
} from "../model/navigation";
import { useCanManageServer } from "features/session/public";
import LibraryOrderDialog from "./LibraryOrderDialog";

interface Props {
  anchorEl: HTMLElement | null;
  library: NavigationLibrary | null;
  libraries: NavigationLibrary[];
  onClose: () => void;
}

export default function LibraryActionsMenu({ anchorEl, library, libraries, onClose }: Props) {
  const canManageServer = useCanManageServer();
  const { settings, setSetting } = useUserSettings();
  const [orderOpen, setOrderOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"refresh-metadata" | "empty-trash" | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const navigation = normalizeLibraryNavigation(libraries, settings);
  const isPinned = Boolean(library && navigation.preference.pinned.includes(library.uuid));

  const closeAnd = (callback: () => void) => {
    onClose();
    callback();
  };

  const togglePinned = async () => {
    if (!library) return;
    const pinned = isPinned
      ? navigation.preference.pinned.filter((id) => id !== library.uuid)
      : [...navigation.preference.pinned, library.uuid];
    await setSetting(
      LIBRARY_NAVIGATION_SETTING,
      serializeLibraryNavigation({ ...navigation.preference, pinned }),
    );
    onClose();
  };

  const action = async (name: "scan" | "refresh-metadata" | "analyze" | "empty-trash") => {
    if (!library) return;
    try {
      await runLibraryAction(library.key, name);
      setNotice(
        name === "scan" ? "Library scan started." :
        name === "refresh-metadata" ? "Metadata refresh started." :
        name === "analyze" ? "Library analysis started." : "Library trash emptied.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Library action failed.");
    }
    setConfirmAction(null);
    onClose();
  };

  return (
    <>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl && library)} onClose={onClose}>
        <MenuItem onClick={togglePinned}>
          <ListItemIcon>{isPinned ? <PushPinOutlined /> : <PushPinRounded />}</ListItemIcon>
          <ListItemText>{isPinned ? "Unpin" : "Pin"}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => closeAnd(() => setOrderOpen(true))}>
          <ListItemIcon><DriveFileMoveRounded /></ListItemIcon>
          <ListItemText>Reorder libraries</ListItemText>
        </MenuItem>

        {canManageServer && library && (
          <>
            <Divider />
            <MenuItem
              component={Link}
              to={`/settings/manage-libraries?edit=${library.key}`}
              onClick={onClose}
            >
              <ListItemIcon><EditRounded /></ListItemIcon>
              <ListItemText>Edit library</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => action("scan")}>
              <ListItemIcon><RefreshRounded /></ListItemIcon>
              <ListItemText>Scan library files</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => closeAnd(() => setConfirmAction("refresh-metadata"))}>
              <ListItemIcon><RestartAltRounded /></ListItemIcon>
              <ListItemText>Refresh all metadata</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => action("analyze")}>
              <ListItemIcon><ManageSearchRounded /></ListItemIcon>
              <ListItemText>Analyze</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => closeAnd(() => setConfirmAction("empty-trash"))}>
              <ListItemIcon><DeleteOutlineRounded /></ListItemIcon>
              <ListItemText>Empty trash</ListItemText>
            </MenuItem>
            <MenuItem
              component={Link}
              to={`/settings/manage-libraries?delete=${library.key}`}
              onClick={onClose}
            >
              <ListItemIcon><MoreHorizRounded /></ListItemIcon>
              <ListItemText>Delete library</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>

      <LibraryOrderDialog open={orderOpen} libraries={libraries} onClose={() => setOrderOpen(false)} />
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "empty-trash" ? "Empty library trash?" : "Refresh all metadata?"}
        message={
          confirmAction === "empty-trash"
            ? "Plex will permanently remove unavailable items from this library."
            : "Plex will refresh metadata for every item in this library."
        }
        busy={confirmBusy}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!confirmAction) return;
          setConfirmBusy(true);
          try {
            await action(confirmAction);
          } finally {
            setConfirmBusy(false);
          }
        }}
        confirmLabel="Continue"
        busyLabel="Working..."
        confirmColor={confirmAction === "empty-trash" ? "error" : "primary"}
      />
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice("")} message={notice} />
    </>
  );
}
