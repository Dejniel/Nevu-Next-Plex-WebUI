import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { getTranscodeImageURL } from "entities/media/model";
import { serverQueryClient } from "shared/api/queryClient";
import { QueryErrorAlert } from "shared/ui/QueryErrorAlert";
import { imageFadeSx, useImageLoading } from "shared/ui/useImageLoading";
import type { ArtworkField } from "../model/metadataEditing";
import {
  validArtworkURL,
  type ArtworkUpdate,
  type createMetadataEditor,
} from "../api/metadata";
import { MetadataLockButton } from "./MetadataLockButton";

export function MetadataArtworkEditor({
  source,
  field,
  label,
  currentImage,
  value,
  onChange,
  locked,
  onLockChange,
  disabled,
}: {
  source: ReturnType<typeof createMetadataEditor>;
  field: ArtworkField;
  label: string;
  currentImage?: string;
  value?: ArtworkUpdate;
  onChange: (value: ArtworkUpdate | undefined) => void;
  locked: boolean;
  onLockChange: (value: boolean) => void;
  disabled: boolean;
}) {
  const options = useQuery(
    {
      queryKey: [
        "media-artwork",
        source.scope?.serverId,
        source.scope?.profileKey,
        source.id,
        field,
      ],
      queryFn: ({ signal }) => source.artwork(field, signal),
    },
    serverQueryClient,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [blob, setBlob] = useState<string>();
  const file = value?.type === "file" ? value.file : undefined;
  useEffect(() => {
    if (!file) {
      setBlob(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setBlob(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const selected = options.data?.find((option) => option.selected);
  const preview =
    value?.type === "remove"
      ? undefined
      : value?.type === "file"
        ? blob
        : value?.type === "existing"
          ? value.preview
          : value?.type === "url"
            ? validArtworkURL(value.url)
              ? value.url
              : undefined
            : selected?.preview || currentImage;
  const imageURL = preview
    ? preview.startsWith("blob:")
      ? preview
      : getTranscodeImageURL(preview, 800, 600)
    : null;
  const image = useImageLoading(imageURL);
  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Typography variant="subtitle1">{label}</Typography>
        <MetadataLockButton
          label={label}
          locked={locked}
          disabled={disabled}
          onChange={onLockChange}
        />
      </Stack>
      <Box
        sx={{
          height: 220,
          bgcolor: "action.hover",
          borderRadius: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {imageURL && image.status !== "missing" ? (
          <Box
            component="img"
            src={imageURL}
            alt={`${label} preview`}
            {...image.imageProps}
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              ...imageFadeSx(image.status === "loaded"),
            }}
          />
        ) : (
          <Typography color="text.secondary">
            {value?.type === "remove" ? "Artwork will be removed" : "No image"}
          </Typography>
        )}
      </Box>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <Button component="label" disabled={disabled}>
          Upload image
          <input
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label={`Upload ${label.toLowerCase()}`}
            onChange={(event) => {
              const next = event.target.files?.[0];
              event.target.value = "";
              if (!next) return;
              if (
                !next.size ||
                ![
                  "image/jpeg",
                  "image/png",
                  "image/webp",
                  "image/gif",
                ].includes(next.type)
              ) {
                setUploadError("Choose a JPEG, PNG, WebP or GIF image.");
                return;
              }
              setUploadError(null);
              onChange({ type: "file", file: next });
            }}
          />
        </Button>
        <Button
          disabled={disabled || (!currentImage && !selected)}
          onClick={() => onChange({ type: "remove" })}
        >
          Remove image
        </Button>
        {value && (
          <Button disabled={disabled} onClick={() => onChange(undefined)}>
            Undo change
          </Button>
        )}
      </Stack>
      {file && <Typography variant="caption">{file.name}</Typography>}
      {uploadError && <Alert severity="error">{uploadError}</Alert>}
      <TextField
        label="Image URL"
        value={value?.type === "url" ? value.url : ""}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value
              ? { type: "url", url: event.target.value.trim() }
              : undefined,
          )
        }
        error={value?.type === "url" && !validArtworkURL(value.url)}
        helperText="Use an HTTP or HTTPS image URL."
      />
      <Typography variant="subtitle2">Available images</Typography>
      <QueryErrorAlert
        error={options.error}
        hasData={options.data !== undefined}
        onRetry={options.refetch}
      />
      {options.isPending ? (
        <CircularProgress size={24} />
      ) : options.data?.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No additional images available. Upload an image or enter its URL.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
            gap: 1,
          }}
        >
          {options.data?.map((option, index) => (
            <Box
              component="button"
              type="button"
              key={option.url}
              disabled={disabled}
              aria-label={`Choose ${label.toLowerCase()} ${index + 1}`}
              aria-pressed={
                value?.type === "existing"
                  ? value.url === option.url
                  : !value && option.selected
              }
              onClick={() =>
                onChange(
                  option.selected
                    ? undefined
                    : {
                        type: "existing",
                        url: option.url,
                        preview: option.preview,
                      },
                )
              }
              sx={{
                p: 0.5,
                borderRadius: 1,
                border: "2px solid",
                borderColor: (
                  value?.type === "existing"
                    ? value.url === option.url
                    : !value && option.selected
                )
                  ? "primary.main"
                  : "transparent",
                bgcolor: "action.hover",
                cursor: "pointer",
              }}
            >
              <Box
                component="img"
                src={getTranscodeImageURL(option.preview, 240, 180)}
                alt=""
                loading="lazy"
                sx={{
                  width: "100%",
                  height: 100,
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}
