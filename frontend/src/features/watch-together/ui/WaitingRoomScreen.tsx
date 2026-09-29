import { Box, Button, LinearProgress, Typography } from "@mui/material";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWatchTogetherDialog } from "../model/dialog";
import { sharedPlaybackPath } from "../model/playback";
import { useWatchTogetherSession } from "../model/session";

export default function WaitingRoomScreen() {
  const { room, isHost, socket } = useWatchTogetherSession();
  const setDialogOpen = useWatchTogetherDialog((state) => state.setOpen);
  const navigate = useNavigate();

  useEffect(() => {
    if (isHost || !room) navigate("/");
  }, [room, isHost, navigate]);

  useEffect(() => {
    if(!socket) return;

    const onPlayback = (
      _user: PerPlexed.Sync.Member,
      data: PerPlexed.Sync.PlayBackState,
    ) => {
      const path = sharedPlaybackPath(data);
      if (!path) return;
      console.log("Playback resync received", data);
      navigate(path);
    };

    socket.once("RES_SYNC_RESYNC_PLAYBACK", onPlayback);
    return () => {
      socket.off("RES_SYNC_RESYNC_PLAYBACK", onPlayback);
    };
  }, [navigate, socket]);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100vh",

        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <img
        src="/nevu-next-below.svg"
        alt="Nevu Next"
        style={{
          width: "min(65vw, 620px)",
          height: "auto",
          display: "block",
        }}
      />

      <Typography
        sx={{
          color: "white",
          fontSize: "24px",
          fontWeight: "bold",
          textAlign: "center",
          marginTop: "20px",
        }}
      >
        Waiting for host to start playback...
      </Typography>

      <LinearProgress
        sx={{
          width: "200px",
          marginTop: "20px",
        }}
      />

      <Button onClick={() => setDialogOpen(true)} sx={{ marginTop: "20px" }}>
        Open Sync Interface
      </Button>
    </Box>
  );
}
