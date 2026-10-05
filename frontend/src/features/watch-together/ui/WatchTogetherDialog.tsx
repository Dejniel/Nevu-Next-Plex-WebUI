import { ContentCopyRounded } from "@mui/icons-material";
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppDialog } from "shared/ui";
import { useWatchTogetherDialog } from "../model/dialog";
import { useWatchTogetherSession } from "../model/session";

type DialogPage = "home" | "join" | "connecting" | "connected";

export default function WatchTogetherDialog() {
  const { open, setOpen } = useWatchTogetherDialog();
  const { room, isHost, connect, disconnect } = useWatchTogetherSession();
  const navigate = useNavigate();
  const [inputRoom, setInputRoom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<DialogPage>("home");

  useEffect(() => {
    if (!open) {
      if (!room) setPage("home");
      return;
    }
    setPage(room ? "connected" : "home");
  }, [open, room]);

  const startSession = async (roomID?: string) => {
    setError(null);
    setPage("connecting");
    const result = await connect(roomID);
    if (result !== true) {
      setError(result.message);
      setPage(roomID ? "join" : "home");
      return;
    }

    if (!useWatchTogetherSession.getState().isHost) {
      setOpen(false);
      navigate("/sync/waitingroom");
      return;
    }
    setPage("connected");
  };

  return (
    <AppDialog open={open} title="Nevu Sync" onClose={() => setOpen(false)}>
      <Box
        sx={{
          width: "100%",
          minHeight: 150,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Collapse in={error !== null}>
          <Typography color="error" sx={{ fontSize: 14 }}>
            {error}
          </Typography>
        </Collapse>

        {page === "connecting" && <CircularProgress color="primary" />}

        {page === "connected" && (
          <>
            <Box sx={{ display: "flex", alignItems: "stretch", gap: 1 }}>
              <TextField
                id="room-id"
                value={room || ""}
                slotProps={{ input: { readOnly: true } }}
                label="Room ID"
              />
              <IconButton
                color="primary"
                aria-label="Copy room ID"
                onClick={() => void navigator.clipboard.writeText(room || "")}
              >
                <ContentCopyRounded />
              </IconButton>
            </Box>
            <Box sx={{ display: "flex", gap: 2 }}>
              {isHost && (
                <Button variant="text" onClick={() => setOpen(false)}>
                  Go
                </Button>
              )}
              <Button
                variant="text"
                onClick={() => {
                  disconnect();
                  setPage("home");
                }}
              >
                Disconnect
              </Button>
            </Box>
          </>
        )}

        {page === "join" && (
          <>
            <TextField
              id="room-id"
              label="Room ID"
              value={inputRoom}
              autoFocus
              onChange={(event) => setInputRoom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && inputRoom.trim())
                  void startSession(inputRoom.trim());
              }}
            />
            <Box sx={{ display: "flex", gap: 2 }}>
              <Button
                variant="text"
                onClick={() => {
                  setError(null);
                  setPage("home");
                }}
              >
                Back
              </Button>
              <Button
                variant="text"
                disabled={!inputRoom.trim()}
                onClick={() => void startSession(inputRoom.trim())}
              >
                Join
              </Button>
            </Box>
          </>
        )}

        {page === "home" && (
          <Box
            sx={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "stretch",
            }}
          >
            <Button variant="text" onClick={() => void startSession()}>
              Host
            </Button>
            <Divider orientation="vertical" flexItem />
            <Button
              variant="text"
              onClick={() => {
                setInputRoom("");
                setError(null);
                setPage("join");
              }}
            >
              Join
            </Button>
          </Box>
        )}
      </Box>
    </AppDialog>
  );
}
