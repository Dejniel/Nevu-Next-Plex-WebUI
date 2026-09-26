import {
  Alert,
  Avatar,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { LockRounded, LogoutRounded } from "@mui/icons-material";
import React, { useState } from "react";
import { HomeProfile } from "../auth/AuthStorage";
import { useAuthSession } from "../states/AuthSessionState";

export default function ProfilePicker() {
  const { profiles, status, error, selectProfile, signOut } = useAuthSession();
  const [selectedProfile, setSelectedProfile] = useState<HomeProfile | null>(null);
  const [pin, setPin] = useState("");
  const unlocking = status === "unlocking";

  const chooseProfile = async (profile: HomeProfile) => {
    if (profile.protected) {
      setPin("");
      setSelectedProfile(profile);
      return;
    }
    await selectProfile(profile);
  };

  const unlockProfile = async () => {
    if (!selectedProfile) return;
    await selectProfile(selectedProfile, pin);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#000",
        px: 2,
        py: 6,
      }}
    >
      <Typography variant="h3" component="h1" sx={{ mb: 5, textAlign: "center" }}>
        Who's watching?
      </Typography>

      {error && !selectedProfile && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: { xs: 2, sm: 4 },
          width: "min(760px, 100%)",
          justifyItems: "center",
        }}
      >
        {profiles.map((profile) => (
          <ButtonBase
            key={profile.id}
            disabled={unlocking}
            onClick={() => chooseProfile(profile)}
            sx={{
              width: 128,
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: 1,
              borderRadius: "6px",
            }}
          >
            <Box sx={{ position: "relative" }}>
              <Avatar
                src={profile.thumb}
                alt=""
                variant="square"
                sx={{ width: 104, height: 104, borderRadius: "6px" }}
              />
              {profile.protected && (
                <LockRounded
                  fontSize="small"
                  sx={{
                    position: "absolute",
                    right: 6,
                    bottom: 6,
                    bgcolor: "rgba(0,0,0,0.75)",
                    borderRadius: "50%",
                    p: "3px",
                    width: 24,
                    height: 24,
                  }}
                />
              )}
            </Box>
            <Typography
              sx={{
                width: "100%",
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {profile.title}
            </Typography>
          </ButtonBase>
        ))}
      </Box>

      <Button
        variant="text"
        startIcon={<LogoutRounded />}
        onClick={signOut}
        disabled={unlocking}
        sx={{ mt: 5 }}
      >
        Sign out of Plex
      </Button>

      <Dialog
        open={Boolean(selectedProfile)}
        onClose={() => !unlocking && setSelectedProfile(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{selectedProfile?.title}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="PIN"
            value={pin}
            disabled={unlocking}
            inputProps={{ inputMode: "numeric", maxLength: 4 }}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && pin) unlockProfile();
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedProfile(null)} disabled={unlocking}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={unlockProfile}
            disabled={!pin || unlocking}
            startIcon={unlocking ? <CircularProgress size={16} /> : <LockRounded />}
          >
            Unlock
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
