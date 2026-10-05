import { Alert, Box, Button } from "@mui/material";
import React, { ReactNode, useEffect, useState } from "react";
import { useUserSettings } from "features/settings/model";
import { useAuthSession } from "../model/authSession";
import { plexProfileKey } from "../model/profileIdentity";
import { LoadingScreen } from "./SessionGate";

export default function ProfileBootstrapGate({
  children,
}: {
  children: ReactNode;
}) {
  const profileKey = useAuthSession((state) =>
    plexProfileKey(state.ownerUser, state.activeProfile),
  );
  const revision = useAuthSession((state) => state.revision);
  const status = useUserSettings((state) => state.status);
  const loadedProfileKey = useUserSettings((state) => state.profileKey);
  const error = useUserSettings((state) => state.error);
  const initialize = useUserSettings((state) => state.initialize);
  const [startedBootstrap, setStartedBootstrap] = useState<string | null>(null);

  const bootstrapKey = profileKey ? `${revision}:${profileKey}` : null;

  useEffect(() => {
    if (!profileKey || !bootstrapKey) {
      setStartedBootstrap(null);
      return;
    }
    useUserSettings.getState().reset();
    setStartedBootstrap(bootstrapKey);
    void initialize(profileKey);
  }, [bootstrapKey, initialize, profileKey]);

  if (
    !profileKey ||
    startedBootstrap !== bootstrapKey ||
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
