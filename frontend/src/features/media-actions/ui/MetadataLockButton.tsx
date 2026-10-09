import { LockOpenRounded, LockRounded } from "@mui/icons-material";
import { IconButton, Tooltip } from "@mui/material";

export function MetadataLockButton({
  label,
  locked,
  disabled,
  onChange,
}: {
  label: string;
  locked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Tooltip
      title={
        locked
          ? "Keep this field during metadata refresh"
          : "Allow Plex to update this field"
      }
    >
      <span>
        <IconButton
          size="small"
          disabled={disabled}
          aria-label={`${locked ? "Unlock" : "Lock"} ${label} metadata`}
          onClick={() => onChange(!locked)}
          sx={{ color: locked ? "primary.main" : "text.disabled" }}
        >
          {locked ? <LockRounded /> : <LockOpenRounded />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
