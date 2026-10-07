import { RestoreRounded } from "@mui/icons-material";
import {
  Box,
  FormControlLabel,
  IconButton,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useId } from "react";
import { preferenceValueError, type PlexPreference } from "@nevu/contracts";

export default function PreferenceField({
  preference,
  value,
  onChange,
  disabled = false,
  note,
  password = false,
}: {
  preference: PlexPreference;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  note?: string;
  password?: boolean;
}) {
  const id = useId();
  const supported = ["bool", "int", "double", "text"].includes(preference.type);
  const error =
    value !== preference.value
      ? preferenceValueError(preference, value)
      : undefined;
  const help = [
    error || preference.summary,
    note,
    supported ? "" : "This preference type cannot be edited.",
  ]
    .filter(Boolean)
    .join(" ");
  const bool = preference.type === "bool" && !preference.choices.length;
  return (
    <Box
      sx={{ display: "flex", alignItems: "flex-start", gap: 1, minWidth: 0 }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {bool ? (
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={value === "1"}
                  disabled={disabled}
                  onChange={(_, checked) => onChange(checked ? "1" : "0")}
                  slotProps={{ input: { "aria-describedby": `${id}-help` } }}
                />
              }
              label={preference.label}
              sx={{
                alignItems: "flex-start",
                "& .MuiFormControlLabel-label": { pt: 0.75 },
              }}
            />
            {help && (
              <Typography
                id={`${id}-help`}
                variant="body2"
                sx={{ color: error ? "error.main" : "text.secondary" }}
              >
                {help}
              </Typography>
            )}
          </>
        ) : (
          <>
            <Typography
              component="label"
              id={`${id}-label`}
              htmlFor={id}
              variant="body2"
              sx={{ display: "block", mb: 0.75, fontWeight: 500 }}
            >
              {preference.label}
            </Typography>
            <TextField
              id={id}
              fullWidth
              select={Boolean(preference.choices.length)}
              type={
                password
                  ? "password"
                  : ["int", "double"].includes(preference.type)
                    ? "number"
                    : "text"
              }
              value={value}
              onChange={(event) => onChange(event.target.value)}
              disabled={disabled || !supported}
              error={Boolean(error)}
              helperText={help}
              slotProps={{
                htmlInput: preference.choices.length
                  ? undefined
                  : {
                      "aria-labelledby": `${id}-label`,
                      step:
                        preference.type === "double"
                          ? "any"
                          : preference.type === "int"
                            ? 1
                            : undefined,
                    },
                select: {
                  labelId: `${id}-label`,
                  displayEmpty: true,
                  sx: { "& .MuiSelect-select": { whiteSpace: "normal" } },
                },
              }}
            >
              {preference.choices.length > 0 &&
                !preference.choices.some(
                  (choice) => choice.value === value,
                ) && (
                  <MenuItem value={value} disabled>
                    {value || "Current value"}
                  </MenuItem>
                )}
              {preference.choices.map((choice) => (
                <MenuItem key={choice.value} value={choice.value}>
                  {choice.label}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
      </Box>
      <Tooltip title="Restore default">
        <span>
          <IconButton
            aria-label={`Restore default for ${preference.label}`}
            disabled={
              disabled ||
              !supported ||
              value === preference.default ||
              Boolean(preferenceValueError(preference, preference.default))
            }
            onClick={() => onChange(preference.default)}
            size="small"
            sx={{ mt: bool ? 0.75 : 0 }}
          >
            <RestoreRounded fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
