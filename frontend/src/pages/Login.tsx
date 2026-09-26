import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Typography,
} from "@mui/material";
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAccessToken, getPin } from "../plex";
import { authErrorMessage } from "../auth/AuthError";
import { buildPlexAuthUrl } from "../plex/auth";
import { useAuthSession } from "../states/AuthSessionState";

export default function Login() {
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const pinID = query.get("pinID");

  useEffect(() => {
    let active = true;

    const login = async () => {
      try {
        if (pinID) {
          const res = await getAccessToken(pinID);
          if (!res.authToken)
            return active && setError("Plex did not complete sign-in. Start again.");

          await useAuthSession.getState().completeAccountLogin(res.authToken);
          navigate("/", { replace: true });
          return;
        }

        const res = await getPin();
        if (!res.id || !res.code)
          return active && setError("Plex did not return a valid sign-in request. Try again.");

        const clientIdentifier = localStorage.getItem("clientID");
        if (!clientIdentifier)
          return active && setError("Nevu could not identify this browser. Reload the page and try again.");

        const forwardUrl = new URL("/login", window.location.origin);
        forwardUrl.searchParams.set("pinID", String(res.id));

        window.location.href = buildPlexAuthUrl({
          clientIdentifier,
          pinCode: res.code,
          forwardUrl: forwardUrl.toString(),
        });
      } catch (error) {
        if (active)
          setError(authErrorMessage(error, pinID ? "loginCallback" : "loginStart"));
      }
    };

    setError(null);
    login();

    return () => {
      active = false;
    };
  }, [attempt, navigate, pinID]);

  const retry = () => {
    setError(null);
    if (pinID) navigate("/login", { replace: true });
    else setAttempt((value) => value + 1);
  };

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
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={retry}>
              {pinID ? "Start again" : "Retry"}
            </Button>
          }
        >
          {error}
        </Alert>
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
