import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useId, useState } from "react";
import {
  useActiveServerScope,
  useAuthSession,
  useCanManageServer,
} from "features/session/model";
import { PreferenceField } from "entities/plex-preferences/public";
import { AppDialog } from "shared/ui";
import { QueryErrorAlert } from "shared/ui/QueryErrorAlert";
import {
  useMetadataEditor,
  type MetadataEditor,
  type MetadataEditorSection,
} from "../model/useMetadataEditor";
import {
  artworkTypes,
  metadataArtworkLabel,
  type ArtworkField,
  type MetadataEditingItem,
} from "../model/metadataEditing";
import { MetadataArtworkEditor } from "./MetadataArtworkEditor";
import { MetadataGeneralFields, MetadataTagFields } from "./MetadataFields";
import { MetadataMusicParents } from "./MetadataMusicParents";

interface Props {
  data: MetadataEditingItem;
  open: boolean;
  onClose: () => void;
  onSaved?: (result: { ratingKey: string }) => void;
  onRelocated?: (ratingKey: string) => void;
}
export default function EditMetadataDialog(props: Props) {
  const scope = useActiveServerScope();
  const revision = useAuthSession((state) => state.revision);
  const allowed = useCanManageServer();
  return props.open && allowed ? (
    <OpenedMetadataEditor
      key={`${scope.serverId}:${scope.profileKey}:${revision}:${props.data.ratingKey}`}
      {...props}
    />
  ) : null;
}

const sections: { id: MetadataEditorSection; label: string }[] = [
  { id: "general", label: "General" },
  { id: "tags", label: "Tags & people" },
  { id: "artwork", label: "Artwork" },
  { id: "advanced", label: "Advanced" },
];

function OpenedMetadataEditor({ data, onClose, onSaved, onRelocated }: Props) {
  const editor = useMetadataEditor(data, onClose, onSaved, onRelocated);
  const wide = useMediaQuery("(min-width:900px)");
  const id = useId();
  return (
    <AppDialog
      open
      title="Edit metadata"
      maxWidth={1100}
      busy={editor.mutation.isPending}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose} disabled={editor.mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={editor.save}
            disabled={!editor.canSave}
            startIcon={
              editor.mutation.isPending ? (
                <CircularProgress size={16} />
              ) : undefined
            }
          >
            Save
          </Button>
        </>
      }
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 2, overflowWrap: "anywhere" }}
      >
        {editor.initial.title}
      </Typography>
      {editor.mutation.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {editor.mutation.error.message}
        </Alert>
      )}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 3,
          minWidth: 0,
        }}
      >
        <Tabs
          value={editor.section}
          onChange={(_, value) => editor.setSection(value)}
          variant="scrollable"
          orientation={wide ? "vertical" : "horizontal"}
          aria-label="Metadata sections"
          sx={{
            flexShrink: 0,
            width: { md: 160 },
            borderRight: { md: 1 },
            borderBottom: { xs: 1, md: 0 },
            borderColor: "divider",
            position: { xs: "sticky", md: "static" },
            top: 0,
            zIndex: 1,
            bgcolor: "background.paper",
          }}
        >
          {sections.map((section) => (
            <Tab
              key={section.id}
              label={section.label}
              value={section.id}
              id={`${id}-${section.id}`}
              aria-controls={`${id}-panel`}
              sx={{ alignItems: { md: "flex-start" } }}
            />
          ))}
        </Tabs>
        <Box
          component="form"
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-${editor.section}`}
          onSubmit={(event) => {
            event.preventDefault();
            editor.save();
          }}
          sx={{ flex: 1, minWidth: 0, pt: 1 }}
        >
          {editor.section === "general" && (
            <>
              <MetadataGeneralFields editor={editor} />
              <MetadataMusicParents editor={editor} />
            </>
          )}
          {editor.section === "tags" && <MetadataTagFields editor={editor} />}
          {editor.section === "artwork" && <ArtworkPanel editor={editor} />}
          {editor.section === "advanced" && <AdvancedPanel editor={editor} />}
        </Box>
      </Box>
    </AppDialog>
  );
}

function ArtworkPanel({ editor }: { editor: MetadataEditor }) {
  const [field, setField] = useState<ArtworkField>("thumb");
  const label = (name: ArtworkField) =>
    name === "thumb"
      ? metadataArtworkLabel(editor.initial.type)
      : artworkTypes[name].label;
  return (
    <Box>
      <Tabs
        value={field}
        onChange={(_, value) => setField(value)}
        variant="scrollable"
        aria-label="Artwork types"
        sx={{ mb: 2 }}
      >
        {editor.source.capabilities.artwork.map((name) => (
          <Tab key={name} value={name} label={label(name)} />
        ))}
      </Tabs>
      <MetadataArtworkEditor
        key={field}
        source={editor.source}
        field={field}
        label={label(field)}
        currentImage={editor.initial[field]}
        value={editor.artwork[field]}
        locked={Boolean(editor.locks[field])}
        disabled={editor.mutation.isPending}
        onLockChange={(value) => editor.setLock(field, value)}
        onChange={(value) => editor.setArtwork(field, value)}
      />
    </Box>
  );
}

function AdvancedPanel({ editor }: { editor: MetadataEditor }) {
  const query = editor.preferences;
  const deleting = Object.entries(editor.preferenceDraft.changes).some(
    ([id, value]) => id.startsWith("autoDeletion") && value !== "0",
  );
  return (
    <Stack spacing={2}>
      <QueryErrorAlert
        error={query.error}
        hasData={query.data !== undefined}
        onRetry={query.refetch}
      />
      {query.isPending && !query.error ? (
        <CircularProgress size={24} />
      ) : query.data?.length === 0 ? (
        <Typography color="text.secondary">
          No item-specific settings are available.
        </Typography>
      ) : null}
      {deleting && (
        <Alert severity="warning">
          These retention settings can automatically delete media files from the
          Plex server. Review their descriptions before saving.
        </Alert>
      )}
      {query.data?.map((preference) => (
        <PreferenceField
          key={preference.id}
          preference={preference}
          value={
            editor.preferenceDraft.draft[preference.id] ?? preference.value
          }
          onChange={(value) =>
            editor.preferenceDraft.setValue(preference.id, value)
          }
          disabled={editor.mutation.isPending}
          note={
            preference.id.startsWith("autoDeletion")
              ? "This setting controls automatic deletion of media files on the server."
              : undefined
          }
        />
      ))}
    </Stack>
  );
}
