import { useQuery } from "@tanstack/react-query";
import {
  Autocomplete,
  Box,
  CircularProgress,
  createFilterOptions,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import {
  libraryDirectoryQueryOptions,
  librarySectionQueryOptions,
} from "features/library/model";
import type { LibraryFilter } from "entities/library/model";
import { serverQueryClient } from "shared/api/queryClient";
import { QueryErrorAlert } from "shared/ui/QueryErrorAlert";
import type { MetadataEditor } from "../model/useMetadataEditor";
import type { MetadataFieldDefinition } from "../model/metadataEditing";
import { MetadataLockButton } from "./MetadataLockButton";

function FieldLock({
  editor,
  field,
}: {
  editor: MetadataEditor;
  field: MetadataFieldDefinition;
}) {
  return (
    <InputAdornment position="end">
      <MetadataLockButton
        label={field.label}
        locked={Boolean(editor.locks[field.id])}
        disabled={
          editor.mutation.isPending ||
          (field.id === "editionTitle" && !editor.source.capabilities.edition)
        }
        onChange={(value) => editor.setLock(field.id, value)}
      />
    </InputAdornment>
  );
}

export function MetadataGeneralFields({ editor }: { editor: MetadataEditor }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        gap: 2,
      }}
    >
      {editor.fields
        .filter((field) => field.kind !== "tags")
        .map((field) => (
          <TextField
            key={field.id}
            autoFocus={field.id === "title"}
            required={field.id === "title"}
            label={field.label}
            value={editor.draft[field.id] ?? ""}
            disabled={
              editor.mutation.isPending ||
              (field.id === "editionTitle" &&
                !editor.source.capabilities.edition)
            }
            type={
              field.kind === "date"
                ? "date"
                : field.kind === "number"
                  ? "number"
                  : "text"
            }
            multiline={field.kind === "multiline"}
            minRows={field.kind === "multiline" ? 4 : undefined}
            error={Boolean(editor.errors[field.id])}
            helperText={
              field.id === "editionTitle" && !editor.source.capabilities.edition
                ? "Editing editions requires Plex Pass for the server owner and a supported server version."
                : (editor.errors[field.id] ??
                  (field.id === "title" &&
                  ["artist", "album"].includes(editor.item.type)
                    ? "Plex may merge items when the new name matches an existing artist or album."
                    : undefined))
            }
            onChange={(event) => editor.setField(field.id, event.target.value)}
            slotProps={{
              input: {
                endAdornment: <FieldLock editor={editor} field={field} />,
              },
              inputLabel: field.kind === "date" ? { shrink: true } : undefined,
            }}
            sx={{
              gridColumn:
                field.kind === "multiline" ||
                field.id === "title" ||
                field.id === "tagline"
                  ? "1 / -1"
                  : undefined,
            }}
          />
        ))}
    </Box>
  );
}

const people = new Set(["actor", "director", "writer", "producer"]);
const organization = new Set(["collection", "label"]);
export function MetadataTagFields({ editor }: { editor: MetadataEditor }) {
  const scope = editor.source.scope ?? { serverId: "", profileKey: "" };
  const schema = useQuery(
    librarySectionQueryOptions(scope, String(editor.item.librarySectionID)),
    serverQueryClient,
  );
  const filters = schema.data?.Type?.find(
    (type) =>
      type.type ===
      (editor.item.type === "photoalbum" ? "photo" : editor.item.type),
  )?.Filter;
  const groups = [
    {
      title: "Classification",
      includes: (id: string) => !people.has(id) && !organization.has(id),
    },
    { title: "People", includes: (id: string) => people.has(id) },
    { title: "Organization", includes: (id: string) => organization.has(id) },
  ];
  return (
    <Box>
      <QueryErrorAlert error={schema.error} hasData onRetry={schema.refetch} />
      {groups.map((group) => {
        const fields = editor.fields.filter(
          (field) => field.kind === "tags" && group.includes(field.id),
        );
        return fields.length ? (
          <Box key={group.title} sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              {group.title}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
              }}
            >
              {fields.map((field) => (
                <TagField
                  key={field.id}
                  editor={editor}
                  field={field}
                  source={filters?.find((filter) => filter.filter === field.id)}
                />
              ))}
            </Box>
          </Box>
        ) : null;
      })}
    </Box>
  );
}

function TagField({
  editor,
  field,
  source,
}: {
  editor: MetadataEditor;
  field: MetadataFieldDefinition;
  source?: LibraryFilter;
}) {
  const [open, setOpen] = useState(false);
  const scope = editor.source.scope ?? { serverId: "", profileKey: "" };
  const options = libraryDirectoryQueryOptions(scope, source?.key ?? "");
  const query = useQuery(
    {
      ...options,
      enabled: Boolean(open && source && options.enabled),
      select: (data) => [
        ...new Set(data.Directory?.map((entry) => entry.title) ?? []),
      ],
    },
    serverQueryClient,
  );
  return (
    <Autocomplete
      multiple
      freeSolo
      options={query.data ?? []}
      filterOptions={createFilterOptions({ limit: 50 })}
      value={[...((editor.draft[field.id] as readonly string[]) ?? [])]}
      disabled={editor.mutation.isPending}
      loading={Boolean(open && source && query.isPending)}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onChange={(_, values) => editor.setField(field.id, values)}
      renderInput={(params) => (
        <TextField
          {...params}
          label={field.label}
          helperText={
            query.error
              ? "Suggestions could not be loaded. You can still enter a name."
              : field.id === "label"
                ? "Labels can be used in Plex access restrictions. Type a name and press Enter."
                : "Choose an existing name or type one and press Enter."
          }
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {query.isFetching && <CircularProgress size={16} />}
                  {params.slotProps.input.endAdornment}
                  <FieldLock editor={editor} field={field} />
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
