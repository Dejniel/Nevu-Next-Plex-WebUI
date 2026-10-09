import { AddRounded } from "@mui/icons-material";
import { Box, Button, Divider, Snackbar, Typography } from "@mui/material";
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  useActiveServerScope,
  useAuthSession,
  useCanManageServer,
} from "features/session/model";
import LibraryEditorDialog from "./LibraryEditorDialog";
import ManagedLibrariesList from "./ManagedLibrariesList";

export default function SettingsLibrariesAdmin() {
  const revision = useAuthSession((state) => state.revision);
  const { serverId } = useActiveServerScope();
  const canManage = useCanManageServer();
  if (!canManage) return <Navigate to="/settings/account" replace />;
  return <LibraryAdministration key={`${serverId}:${revision}`} />;
}

function LibraryAdministration() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState("");
  const editing = searchParams.get("edit");
  const adding = searchParams.has("add");
  const closeEditor = () => setSearchParams({});
  const changed = (message: string) => {
    closeEditor();
    setNotice(message);
  };
  return (
    <Box sx={{ width: "100%" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h4">Libraries</Typography>
          <Typography sx={{ color: "text.secondary" }}>
            Create and maintain Plex libraries.
          </Typography>
        </Box>
        <Button
          component={Link}
          to="/settings/manage-libraries?add=1"
          variant="contained"
          startIcon={<AddRounded />}
        >
          Add library
        </Button>
      </Box>
      <Divider />
      <ManagedLibrariesList
        deleting={searchParams.get("delete")}
        onCloseDelete={closeEditor}
        onRemoved={changed}
        onNotice={setNotice}
      />
      {(adding || editing) && (
        <LibraryEditorDialog
          key={editing ?? "add"}
          libraryId={editing}
          onClose={closeEditor}
          onSaved={changed}
        />
      )}
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={5000}
        onClose={() => setNotice("")}
        message={notice}
      />
    </Box>
  );
}
