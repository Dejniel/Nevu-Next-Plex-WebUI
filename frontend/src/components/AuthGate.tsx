import { Alert, Box, Button, CircularProgress } from "@mui/material";
import React, { ReactNode, useEffect } from "react";
import Login from "../pages/Login";
import ProfilePicker from "../pages/ProfilePicker";
import { useAuthSession } from "../states/AuthSessionState";

function LoadingScreen() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#000",
      }}
    >
      <CircularProgress />
    </Box>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const { status, error, initialize, signOut } = useAuthSession();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (status === "initializing") return <LoadingScreen />;
  if (status === "signedOut") return <Login />;
  if (status === "selectingProfile" || status === "unlocking")
    return <ProfilePicker />;

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
          bgcolor: "#000",
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
