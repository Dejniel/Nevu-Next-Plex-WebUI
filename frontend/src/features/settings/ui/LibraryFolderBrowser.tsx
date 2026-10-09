import { ArrowBackRounded, FolderRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { AppDialog } from "shared/ui";
import { useLibraryFolders } from "../model/useLibraryAdministration";

const ROOT_BROWSE_KEY = "/services/browse/Lw==";

export default function LibraryFolderBrowser({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const [history, setHistory] = useState<Array<{ key: string; path: string }>>([
    { key: ROOT_BROWSE_KEY, path: "/" },
  ]);
  const current = history[history.length - 1];
  const query = useLibraryFolders(current.key);
  const folders = (query.data ?? []).filter(
    (folder) => folder.path !== current.path,
  );

  return (
    <AppDialog
      open
      title="Select folder"
      onClose={onClose}
      contentSx={{ px: 0 }}
    >
      <Box sx={{ px: 2, pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <Tooltip title="Parent folder">
          <span>
            <IconButton
              aria-label="Parent folder"
              disabled={history.length === 1}
              onClick={() => setHistory((items) => items.slice(0, -1))}
            >
              <ArrowBackRounded />
            </IconButton>
          </span>
        </Tooltip>
        <Typography noWrap sx={{ fontFamily: "monospace", flex: 1 }}>
          {current.path}
        </Typography>
        <Button
          variant="contained"
          disabled={current.path === "/"}
          onClick={() => onSelect(current.path)}
        >
          Select
        </Button>
      </Box>
      <Divider />
      {query.error && (
        <Alert
          severity="error"
          sx={{ m: 2 }}
          action={<Button onClick={() => query.refetch()}>Retry</Button>}
        >
          {query.error.message}
        </Alert>
      )}
      {query.isPending ? (
        <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
          <CircularProgress aria-label="Loading folders" />
        </Box>
      ) : (
        <List disablePadding sx={{ maxHeight: "50vh", overflowY: "auto" }}>
          {folders.map((folder) => (
            <ListItemButton
              key={folder.key}
              onClick={() =>
                setHistory((items) => [
                  ...items,
                  { key: folder.key, path: folder.path },
                ])
              }
            >
              <ListItemIcon>
                <FolderRounded />
              </ListItemIcon>
              <ListItemText primary={folder.title} secondary={folder.path} />
            </ListItemButton>
          ))}
          {!folders.length && !query.error && (
            <ListItem>
              <ListItemText primary="No folders found." />
            </ListItem>
          )}
        </List>
      )}
    </AppDialog>
  );
}
