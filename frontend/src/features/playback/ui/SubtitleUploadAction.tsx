import { UploadFileRounded } from "@mui/icons-material";
import { Alert, Box, CircularProgress } from "@mui/material";
import { useRef, useState } from "react";
import { SUBTITLE_FILE_ACCEPT } from "../model/subtitles";
import { TuneAction } from "./TuneControls";

export default function SubtitleUploadAction({
  disabled,
  onUpload,
}: {
  disabled: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      await onUpload(file);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        setError(
          error instanceof Error
            ? error.message
            : "Plex could not upload this subtitle.",
        );
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        aria-label="Subtitle file"
        accept={SUBTITLE_FILE_ACCEPT}
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(file);
        }}
      />
      <TuneAction
        disabled={disabled || uploading}
        icon={
          uploading ? (
            <CircularProgress size={18} />
          ) : (
            <UploadFileRounded fontSize="small" />
          )
        }
        primary={uploading ? "Uploading subtitles…" : "Upload subtitles…"}
        secondary="SRT, VTT, ASS, SSA or SMI · Saved to Plex"
        onClick={() => input.current?.click()}
      />
      {error && (
        <Box sx={{ p: 1 }}>
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Box>
      )}
    </>
  );
}
