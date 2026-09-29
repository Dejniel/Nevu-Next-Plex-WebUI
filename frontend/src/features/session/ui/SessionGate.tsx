import { Alert, Box, Button, CircularProgress } from "@mui/material";
import React, { ReactNode, useEffect } from "react";
import { useAuthSession } from "../model/authSession";
import { PLEX_SESSION_INVALID_EVENT } from "../model/sessionEvents";
import LoginScreen from "./LoginScreen";
import ProfilePickerScreen from "./ProfilePickerScreen";

export function LoadingScreen() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
      }}
    >
      <CircularProgress />
    </Box>
  );
}

export default function SessionGate({ children }: { children: ReactNode }) {
  const { status, error, initialize, signOut } = useAuthSession();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const revalidate = () => {
      if (useAuthSession.getState().status !== "initializing") void initialize();
    };
    window.addEventListener(PLEX_SESSION_INVALID_EVENT, revalidate);
    return () => window.removeEventListener(PLEX_SESSION_INVALID_EVENT, revalidate);
  }, [initialize]);

  if (status === "initializing") return <LoadingScreen />;
  if (status === "signedOut") return <LoginScreen />;
  if (status === "selectingProfile" || status === "unlocking")
    return <ProfilePickerScreen />;

  if (status === "error") {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          bgcolor: "background.default",
          px: 2,
        }}
      >
        <Alert severity="error">{error || "Authentication failed."}</Alert>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" onClick={() => initialize()}>
            Retry
          </Button>
          <Button variant="text" onClick={signOut}>
            Sign out
          </Button>
        </Box>
      </Box>
    );
  }

  return <>{children}</>;
}
