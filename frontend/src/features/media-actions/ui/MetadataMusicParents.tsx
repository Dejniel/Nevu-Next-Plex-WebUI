import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Box,
  CircularProgress,
  TextField,
} from "@mui/material";
import { useDeferredValue, useState } from "react";
import { libraryDirectoryQueryOptions } from "features/library/model";
import { serverQueryClient } from "shared/api/queryClient";
import type { MetadataEditor } from "../model/useMetadataEditor";
import {
  metadataMusicParents,
  type MetadataParent,
} from "../model/metadataEditing";

export function MetadataMusicParents({ editor }: { editor: MetadataEditor }) {
  const { initial, parents } = editor;
  if (initial.type !== "album" && initial.type !== "track") return null;
  const original = metadataMusicParents(initial);
  const moved =
    parents.artist?.id !== original.artist?.id ||
    parents.album?.id !== original.album?.id;
  return (
    <Box sx={{ mt: 3 }}>
      {moved && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Saving moves this{" "}
          {initial.type === "track"
            ? "track into the selected album"
            : "album to the selected artist"}
          . Plex may merge albums with the same name under one artist.
        </Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2,
        }}
      >
        <ParentPicker
          editor={editor}
          type="artist"
          label="Album artist"
          value={parents.artist}
          onChange={(value) => editor.setParent("artist", value)}
        />
        {initial.type === "track" && (
          <ParentPicker
            editor={editor}
            type="album"
            label="Album"
            artistID={parents.artist?.id}
            value={parents.album}
            onChange={(value) => editor.setParent("album", value)}
          />
        )}
      </Box>
    </Box>
  );
}

function ParentPicker({
  editor,
  type,
  label,
  artistID,
  value,
  onChange,
}: {
  editor: MetadataEditor;
  type: "artist" | "album";
  label: string;
  artistID?: string;
  value?: MetadataParent;
  onChange: (value: MetadataParent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const search = useDeferredValue(input);
  const scope = editor.source.scope ?? { serverId: "", profileKey: "" };
  const options = libraryDirectoryQueryOptions(
    scope,
    `/library/sections/${editor.initial.librarySectionID}/all`,
    {
      type: type === "artist" ? 8 : 9,
      ...(search && { title: search }),
      ...(type === "album" && artistID && { "artist.id": artistID }),
      sort: "titleSort:asc",
      "X-Plex-Container-Start": 0,
      "X-Plex-Container-Size": 20,
    },
  );
  const query = useQuery(
    {
      ...options,
      enabled: Boolean(
        open && options.enabled && (type !== "album" || artistID),
      ),
      select: (data) =>
        data.Metadata.filter(
          (item) =>
            item.type === type &&
            (type !== "album" || item.parentRatingKey === artistID),
        ).map((item) => ({ id: item.ratingKey, title: item.title })),
    },
    serverQueryClient,
  );
  const choices =
    value && !query.data?.some((item) => item.id === value.id)
      ? [value, ...(query.data ?? [])]
      : (query.data ?? []);
  return (
    <Autocomplete
      disableClearable={Boolean(value)}
      options={choices}
      value={value ?? null}
      getOptionLabel={(item) => item.title}
      isOptionEqualToValue={(left, right) => left.id === right.id}
      filterOptions={(items) => items}
      disabled={editor.mutation.isPending || (type === "album" && !artistID)}
      loading={query.isFetching}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onInputChange={(_, text, reason) => {
        if (reason === "input") setInput(text);
        else if (reason === "reset" || reason === "selectOption") setInput("");
      }}
      onChange={(_, item) => {
        if (item) onChange(item);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required
          error={!value || Boolean(query.error)}
          helperText={
            query.error
              ? "Could not load choices. Close and reopen the list to retry."
              : !value
                ? "Choose an existing item in this library."
                : "Search this library to choose an existing item."
          }
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {query.isFetching && <CircularProgress size={16} />}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
