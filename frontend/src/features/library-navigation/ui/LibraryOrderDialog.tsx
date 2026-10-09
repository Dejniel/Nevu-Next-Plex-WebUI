import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Button,
  Tooltip,
  FormControlLabel,
  Switch,
  Alert,
} from "@mui/material";
import {
  DragIndicatorRounded,
  PushPinOutlined,
  PushPinRounded,
} from "@mui/icons-material";
import { Reorder, useDragControls } from "motion/react";
import { useState } from "react";
import { AppDialog } from "shared/ui";
import {
  LIBRARY_NAVIGATION_SETTING,
  NavigationLibrary,
  normalizeLibraryNavigation,
  serializeLibraryNavigation,
} from "../model/navigation";
import { useUserSettings } from "features/settings/model";

interface Props {
  open: boolean;
  libraries: NavigationLibrary[];
  onClose: () => void;
}

function OrderRow({
  library,
  pinned,
  disabled,
  onTogglePinned,
}: {
  library: NavigationLibrary;
  pinned: boolean;
  disabled: boolean;
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
            onPointerDown={(event) => !disabled && controls.start(event)}
            sx={{ cursor: disabled ? "default" : "grab", touchAction: "none" }}
          />
        </ListItemIcon>
        <ListItemText primary={library.title} secondary={library.type} />
        <Tooltip title={pinned ? "Unpin library" : "Pin library"}>
          <IconButton
            disabled={disabled}
            onClick={onTogglePinned}
            aria-label={pinned ? "Unpin library" : "Pin library"}
          >
            {pinned ? <PushPinRounded /> : <PushPinOutlined />}
          </IconButton>
        </Tooltip>
      </Box>
    </Reorder.Item>
  );
}

export default function LibraryOrderDialog({
  open,
  libraries,
  onClose,
}: Props) {
  const profileKey = useUserSettings((state) => state.profileKey);
  return open ? (
    <LibraryOrderEditor
      key={profileKey}
      libraries={libraries}
      onClose={onClose}
    />
  ) : null;
}

function LibraryOrderEditor({ libraries, onClose }: Omit<Props, "open">) {
  const { profileKey, setSetting } = useUserSettings();
  const [draft, setDraft] = useState(() => {
    const navigation = normalizeLibraryNavigation(
      libraries,
      useUserSettings.getState().settings,
    );
    return {
      ordered: navigation.ordered,
      pinned: navigation.preference.pinned,
      iconsOnly: navigation.preference.iconsOnly,
    };
  });
  const { ordered, pinned, iconsOnly } = draft;
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    setSaving(true);
    setFailed(false);
    try {
      const saved = await setSetting(
        LIBRARY_NAVIGATION_SETTING,
        serializeLibraryNavigation({
          order: ordered.map((library) => library.uuid),
          pinned,
          iconsOnly,
        }),
      );
      if (saved && useUserSettings.getState().profileKey === profileKey)
        onClose();
      else setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog
      open
      title="Arrange libraries"
      size="compact"
      busy={saving}
      onClose={onClose}
      contentSx={{ px: 2 }}
      actions={
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      }
    >
      <FormControlLabel
        control={
          <Switch
            checked={iconsOnly}
            disabled={saving}
            onChange={(_, value) =>
              setDraft((current) => ({ ...current, iconsOnly: value }))
            }
          />
        }
        label="Show only library icons in the top bar"
        sx={{ mb: 1 }}
      />
      {failed && (
        <Alert severity="error" sx={{ mb: 1 }}>
          Library preferences could not be saved. Please try again.
        </Alert>
      )}
      <Reorder.Group
        axis="y"
        values={ordered}
        onReorder={(ordered) =>
          setDraft((current) => ({ ...current, ordered }))
        }
        style={{ margin: 0, padding: 0 }}
      >
        {ordered.map((library) => (
          <OrderRow
            key={library.uuid}
            library={library}
            pinned={pinned.includes(library.uuid)}
            disabled={saving}
            onTogglePinned={() =>
              setDraft((current) => ({
                ...current,
                pinned: current.pinned.includes(library.uuid)
                  ? current.pinned.filter((id) => id !== library.uuid)
                  : [...current.pinned, library.uuid],
              }))
            }
          />
        ))}
      </Reorder.Group>
    </AppDialog>
  );
}
