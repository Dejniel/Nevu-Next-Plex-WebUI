import { useMutation } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import {
  useActiveServerScope,
  useAuthSession,
  useCanManageServer,
} from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { AppDialog } from "shared/ui";
import {
  createMetadataEditor,
  MetadataSaveError,
  validArtworkURL,
  type ArtworkChanges,
} from "../api/metadata";
import {
  draftFromMetadata,
  metadataArtworkLabel,
  metadataChanges,
  metadataDraftErrors,
  metadataFields,
  metadataLocks,
  sameMetadataValue,
  type ArtworkField,
  type MetadataField,
  type MetadataValue,
  type MetadataLockUpdate,
  type MetadataEditingItem,
} from "../model/metadataEditing";
import { MetadataArtworkEditor } from "./MetadataArtworkEditor";
import { MetadataLockButton } from "./MetadataLockButton";

interface Props {
  data: MetadataEditingItem;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function EditMetadataDialog(props: Props) {
  const scope = useActiveServerScope();
  const revision = useAuthSession((state) => state.revision);
  const allowed = useCanManageServer();
  return props.open && allowed ? (
    <MetadataEditor
      key={`${scope.serverId}:${scope.profileKey}:${revision}:${props.data.ratingKey}`}
      {...props}
    />
  ) : null;
}

function MetadataEditor({ data, onClose, onSaved }: Props) {
  // Canonical refreshes keep flowing outside the dialog. This opened edit has
  // a stable baseline, so those refreshes cannot erase the user's draft.
  const [initial] = useState(() => data);
  const [source] = useState(() => createMetadataEditor(initial));
  const [baseline] = useState(() => draftFromMetadata(initial));
  const [initialLocks, setInitialLocks] = useState(() =>
    metadataLocks(initial),
  );
  const [draft, setDraft] = useState(baseline);
  const [locks, setLocks] = useState(initialLocks);
  const [artwork, setArtwork] = useState<ArtworkChanges>({});
  const [tab, setTab] = useState<"general" | "tags" | ArtworkField>("general");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const mutation = useMutation(
    {
      mutationKey: [
        "metadata-edit",
        source.scope?.serverId,
        source.scope?.profileKey,
        source.revision,
        source.id,
      ],
      mutationFn: async (values: {
        changes: ReturnType<typeof metadataChanges>;
        locks: MetadataLockUpdate;
        artwork: ArtworkChanges;
      }) => {
        source.assertCurrent();
        const controller = new AbortController();
        request.current = controller;
        await source.save(
          values.changes,
          values.locks,
          values.artwork,
          controller.signal,
        );
        source.assertCurrent(controller.signal);
      },
      retry: false,
      onSuccess: () => {
        try {
          source.assertCurrent(request.current?.signal);
        } catch {
          return;
        }
        onSaved?.();
        onClose();
      },
      onError: (error) => {
        if (error instanceof MetadataSaveError) {
          setArtwork((current) =>
            Object.fromEntries(
              Object.entries(current).filter(
                ([field]) =>
                  !error.completedArtwork.includes(field as ArtworkField),
              ),
            ),
          );
          setInitialLocks((current) => ({
            ...current,
            ...Object.fromEntries(
              error.completedArtwork.map((field) => [field, true]),
            ),
          }));
        }
      },
    },
    serverQueryClient,
  );
  const fields = metadataFields(initial.type);
  const changes = metadataChanges(baseline, draft);
  const lockChanges: MetadataLockUpdate = Object.fromEntries(
    [...fields.map((field) => field.id), "thumb", "art"]
      .filter(
        (field) =>
          changes[field as MetadataField] !== undefined ||
          Object.hasOwn(artwork, field) ||
          Boolean(locks[field as keyof MetadataLockUpdate]) !==
            Boolean(initialLocks[field as keyof MetadataLockUpdate]),
      )
      .map((field) => [
        field,
        Boolean(locks[field as keyof MetadataLockUpdate]),
      ]),
  );
  const errors = metadataDraftErrors(initial.type, draft);
  const dirty =
    Object.keys(changes).length > 0 ||
    Object.keys(lockChanges).length > 0 ||
    Object.keys(artwork).length > 0;
  const valid =
    Object.keys(errors).length === 0 &&
    !Object.values(artwork).some(
      (value) => value.type === "url" && !validArtworkURL(value.url),
    );
  const setField = (field: MetadataField, value: MetadataValue) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setLocks((current) => ({
      ...current,
      [field]: sameMetadataValue(baseline[field], value)
        ? Boolean(initialLocks[field])
        : true,
    }));
  };
  const lock = (field: MetadataField, label: string) => (
    <InputAdornment position="end">
      <MetadataLockButton
        label={label}
        locked={Boolean(locks[field])}
        disabled={mutation.isPending}
        onChange={(value) =>
          setLocks((current) => ({ ...current, [field]: value }))
        }
      />
    </InputAdornment>
  );
  const save = () => {
    if (dirty && valid && !mutation.isPending)
      mutation.mutate({ changes, locks: lockChanges, artwork });
  };
  const artworkLabel =
    tab === "thumb" ? metadataArtworkLabel(initial.type) : "Background";
  return (
    <AppDialog
      open
      title="Edit metadata"
      busy={mutation.isPending}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={!dirty || !valid || mutation.isPending}
            startIcon={
              mutation.isPending ? <CircularProgress size={16} /> : undefined
            }
          >
            Save
          </Button>
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        variant="scrollable"
        sx={{ mb: 2 }}
      >
        <Tab label="General" value="general" />
        <Tab label="Tags" value="tags" />
        <Tab label={metadataArtworkLabel(initial.type)} value="thumb" />
        <Tab label="Background" value="art" />
      </Tabs>
      {mutation.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {mutation.error.message}
        </Alert>
      )}
      {tab === "thumb" || tab === "art" ? (
        <MetadataArtworkEditor
          key={tab}
          source={source}
          field={tab}
          label={artworkLabel}
          currentImage={data[tab]}
          value={artwork[tab]}
          locked={Boolean(locks[tab])}
          disabled={mutation.isPending}
          onLockChange={(value) =>
            setLocks((current) => ({ ...current, [tab]: value }))
          }
          onChange={(value) => {
            setArtwork((current) => {
              const next = { ...current };
              if (value) next[tab] = value;
              else delete next[tab];
              return next;
            });
            setLocks((current) => ({
              ...current,
              [tab]: value ? true : Boolean(initialLocks[tab]),
            }));
          }}
        />
      ) : (
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
            pt: 1,
          }}
        >
          {fields
            .filter((field) => (field.kind === "tags") === (tab === "tags"))
            .map((field) =>
              field.kind === "tags" ? (
                <Autocomplete
                  key={field.id}
                  multiple
                  freeSolo
                  options={[]}
                  value={[...((draft[field.id] as readonly string[]) ?? [])]}
                  disabled={mutation.isPending}
                  onChange={(_, values) => setField(field.id, values)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={field.label}
                      helperText="Type a name and press Enter."
                      slotProps={{
                        ...params.slotProps,
                        input: {
                          ...params.slotProps.input,
                          endAdornment: (
                            <>
                              {params.slotProps.input.endAdornment}
                              {lock(field.id, field.label)}
                            </>
                          ),
                        },
                      }}
                    />
                  )}
                />
              ) : (
                <TextField
                  key={field.id}
                  autoFocus={field.id === "title"}
                  required={field.id === "title"}
                  label={field.label}
                  value={draft[field.id] ?? ""}
                  disabled={mutation.isPending}
                  type={
                    field.kind === "date"
                      ? "date"
                      : field.kind === "number"
                        ? "number"
                        : "text"
                  }
                  multiline={field.kind === "multiline"}
                  minRows={field.kind === "multiline" ? 5 : undefined}
                  error={Boolean(errors[field.id])}
                  helperText={errors[field.id]}
                  onChange={(event) => setField(field.id, event.target.value)}
                  slotProps={{
                    input: { endAdornment: lock(field.id, field.label) },
                    inputLabel:
                      field.kind === "date" ? { shrink: true } : undefined,
                  }}
                  sx={{
                    gridColumn:
                      field.kind === "multiline" || field.id === "title"
                        ? "1 / -1"
                        : undefined,
                  }}
                />
              ),
            )}
        </Box>
      )}
    </AppDialog>
  );
}
