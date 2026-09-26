import {
  Alert,
  Box,
  CircularProgress,
  Collapse,
  Typography,
} from "@mui/material";
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAccessToken, getPin } from "../plex";
import { buildPlexAuthUrl } from "../plex/auth";
import { useAuthSession } from "../states/AuthSessionState";

export default function Login() {
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    const login = async () => {
      try {
        const pinID = query.get("pinID");
        if (pinID) {
          const res = await getAccessToken(pinID);
          if (!res.authToken)
            return setError("Failed to log in. Please try again.");

          navigate("/", { replace: true });
          await useAuthSession.getState().completeAccountLogin(res.authToken);
          return;
        }

        const res = await getPin();
        if (!res.id || !res.code)
          return setError("Failed to get pin for login. Please try again.");

        const clientIdentifier = localStorage.getItem("clientID");
        if (!clientIdentifier)
          return setError("Failed to identify this client. Please try again.");

        const forwardUrl = new URL("/login", window.location.origin);
        forwardUrl.searchParams.set("pinID", String(res.id));

        window.location.href = buildPlexAuthUrl({
          clientIdentifier,
          pinCode: res.code,
          forwardUrl: forwardUrl.toString(),
        });
      } catch {
        setError("Failed to log in. Please try again.");
      }
    };

    login();
  }, [navigate, query]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <Collapse in={Boolean(error)}>
        <Alert severity="error">{error}</Alert>
      </Collapse>
      {!error && (
        <>
          <CircularProgress />
          <Typography
            sx={{
              fontSize: "1rem",
              fontWeight: "bold",
            }}
          >
            Logging in...
          </Typography>
        </>
      )}
    </Box>
  );
}
