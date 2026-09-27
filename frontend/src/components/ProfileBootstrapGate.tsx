import { Alert, Box, Button } from "@mui/material";
import React, { ReactNode, useEffect } from "react";
import { useAuthSession } from "../states/AuthSessionState";
import { useUserSettings } from "../states/UserSettingsState";
import { LoadingScreen } from "./AuthGate";

export default function ProfileBootstrapGate({
  children,
}: {
  children: ReactNode;
}) {
  const activeProfile = useAuthSession((state) => state.activeProfile);
  const ownerUser = useAuthSession((state) => state.ownerUser);
  const status = useUserSettings((state) => state.status);
  const loadedProfileKey = useUserSettings((state) => state.profileKey);
  const error = useUserSettings((state) => state.error);
  const initialize = useUserSettings((state) => state.initialize);

  const profileKey =
    ownerUser && activeProfile ? `${ownerUser.id}:${activeProfile.id}` : null;

  useEffect(() => {
    if (profileKey) void initialize(profileKey);
  }, [initialize, profileKey]);

  if (
    !profileKey ||
    loadedProfileKey !== profileKey ||
    status === "idle" ||
    status === "loading"
  ) {
    return <LoadingScreen />;
  }

  return (
    <>
      {status === "error" && error && (
        <Box
          sx={{
            position: "fixed",
            top: 72,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1500,
          }}
        >
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => void initialize(profileKey)}
              >
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        </Box>
      )}
      {children}
    </>
  );
}
