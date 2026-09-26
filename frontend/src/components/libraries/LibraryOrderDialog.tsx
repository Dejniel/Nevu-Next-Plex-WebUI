import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Button,
  Tooltip,
} from "@mui/material";
import {
  DragIndicatorRounded,
  PushPinOutlined,
  PushPinRounded,
} from "@mui/icons-material";
import { Reorder, useDragControls } from "framer-motion";
import React, { useEffect, useState } from "react";
import {
  LIBRARY_NAVIGATION_SETTING,
  NavigationLibrary,
  normalizeLibraryNavigation,
  serializeLibraryNavigation,
} from "../../plex/libraryNavigation";
import { useUserSettings } from "../../states/UserSettingsState";

interface Props {
  open: boolean;
  libraries: NavigationLibrary[];
  onClose: () => void;
}

function OrderRow({
  library,
  pinned,
  onTogglePinned,
}: {
  library: NavigationLibrary;
  pinned: boolean;
  onTogglePinned: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={library}
      dragListener={false}
      dragControls={controls}
      style={{ listStyle: "none" }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: 48,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <ListItemIcon sx={{ minWidth: 40 }}>
          <DragIndicatorRounded
            onPointerDown={(event) => controls.start(event)}
            sx={{ cursor: "grab", touchAction: "none" }}
          />
        </ListItemIcon>
        <ListItemText primary={library.title} secondary={library.type} />
        <Tooltip title={pinned ? "Unpin library" : "Pin library"}>
          <IconButton onClick={onTogglePinned} aria-label={pinned ? "Unpin library" : "Pin library"}>
            {pinned ? <PushPinRounded /> : <PushPinOutlined />}
          </IconButton>
        </Tooltip>
      </Box>
    </Reorder.Item>
  );
}

export default function LibraryOrderDialog({ open, libraries, onClose }: Props) {
  const { settings, setSetting } = useUserSettings();
  const [ordered, setOrdered] = useState<NavigationLibrary[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const navigation = normalizeLibraryNavigation(libraries, settings);
    setOrdered(navigation.ordered);
    setPinned(navigation.preference.pinned);
  }, [libraries, open, settings]);

  const save = async () => {
    await setSetting(
      LIBRARY_NAVIGATION_SETTING,
      serializeLibraryNavigation({
        order: ordered.map((library) => library.uuid),
        pinned,
      }),
    );
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Arrange libraries</DialogTitle>
      <DialogContent sx={{ px: 2 }}>
        <Reorder.Group
          axis="y"
          values={ordered}
          onReorder={setOrdered}
          style={{ margin: 0, padding: 0 }}
        >
          {ordered.map((library) => (
            <OrderRow
              key={library.uuid}
              library={library}
              pinned={pinned.includes(library.uuid)}
              onTogglePinned={() =>
                setPinned((current) =>
                  current.includes(library.uuid)
                    ? current.filter((id) => id !== library.uuid)
                    : [...current, library.uuid],
                )
              }
            />
          ))}
        </Reorder.Group>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
