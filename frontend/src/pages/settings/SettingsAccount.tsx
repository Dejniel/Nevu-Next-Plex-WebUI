import { Box, Button, Divider, Typography } from "@mui/material";
import { SwitchAccountRounded } from "@mui/icons-material";
import React from "react";
import CheckBoxOption from "../../components/settings/CheckBoxOption";
import { useAuthSession } from "features/session/public";

export default function SettingsAccount() {
  const {
    activeProfile,
    rememberProfile,
    setRememberProfile,
    switchProfile,
  } = useAuthSession();

  return (
    <>
      <Typography variant="h4">Account</Typography>
      <Box sx={{ mt: 3, width: "100%" }}>
        <CheckBoxOption
          title="Remember selected Plex Home profile"
          subtitle="Keep this profile active until it is changed manually."
          checked={rememberProfile}
          onChange={setRememberProfile}
        />

        <Divider sx={{ my: 3 }} />

        <Typography sx={{ mb: 1.5, color: "text.secondary" }}>
          Active profile: {activeProfile?.title || "Unknown"}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<SwitchAccountRounded />}
          onClick={() => switchProfile()}
        >
          Switch profile
        </Button>
      </Box>
    </>
  );
}
