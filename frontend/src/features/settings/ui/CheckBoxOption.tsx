import { Stack, Checkbox, Typography, Box } from "@mui/material";
import React from "react";

function CheckBoxOption({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column" }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Checkbox
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <Typography>{title}</Typography>
      </Stack>
      {subtitle && (
        <Typography sx={{
            color: "#AAA",
            fontSize: "0.9rem",
            userSelect: "none",
            ml: "10px",
        }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}

export default CheckBoxOption;
