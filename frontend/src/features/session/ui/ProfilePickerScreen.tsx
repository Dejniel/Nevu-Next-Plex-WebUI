import {
  Alert,
  Avatar,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import { LockRounded, LogoutRounded } from "@mui/icons-material";
import React, { useEffect, useRef, useState } from "react";
import { AppDialog } from "shared/ui";
import type { HomeProfile } from "../model/authStorage";
import { useAuthSession } from "../model/authSession";

export default function ProfilePickerScreen() {
  const { profiles, status, error, selectProfile, signOut, clearError } = useAuthSession();
  const [selectedProfile, setSelectedProfile] = useState<HomeProfile | null>(null);
  const [pin, setPin] = useState("");
  const pinInputRef = useRef<HTMLInputElement>(null);
  const unlocking = status === "unlocking";

  useEffect(() => {
    if (selectedProfile && !unlocking) pinInputRef.current?.focus();
  }, [selectedProfile, unlocking]);

  const chooseProfile = async (profile: HomeProfile) => {
    clearError();
    if (profile.protected) {
      setPin("");
      setSelectedProfile(profile);
      return;
    }
    await selectProfile(profile);
  };

  const unlockProfile = async (submittedPin = pin) => {
    if (!selectedProfile || submittedPin.length !== 4) return;
    const unlocked = await selectProfile(selectedProfile, submittedPin);
    if (!unlocked) setPin("");
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
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

      <AppDialog
        open={Boolean(selectedProfile)}
        title={selectedProfile?.title || "Enter PIN"}
        size="compact"
        busy={unlocking}
        onClose={() => {
          clearError();
          setSelectedProfile(null);
        }}
        actions={unlocking ? <CircularProgress size={20} sx={{ mx: 1 }} /> : undefined}
      >
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ position: "relative", mt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            type="text"
            value={pin}
            inputRef={pinInputRef}
            autoComplete="one-time-code"
            slotProps={{
              htmlInput: {
                "aria-label": "PIN",
                "aria-busy": unlocking,
                inputMode: "numeric",
                maxLength: 4,
                pattern: "[0-9]*",
                readOnly: unlocking,
                autoCorrect: "off",
                spellCheck: false,
              },
            }}
            onChange={(event) => {
              const nextPin = event.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(nextPin);
              if (nextPin.length === 4 && !unlocking)
                void unlockProfile(nextPin);
            }}
            sx={{
              "& input": {
                color: "transparent",
                WebkitTextFillColor: "transparent",
                caretColor: "transparent",
                fontSize: 0,
                textAlign: "center",
              },
            }}
          />
          <Box
            aria-hidden="true"
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
              pointerEvents: "none",
            }}
          >
            {[0, 1, 2, 3].map((index) => (
              <Box
                key={index}
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: index < pin.length ? "text.primary" : "transparent",
                  border: "1px solid",
                  borderColor: "text.secondary",
                }}
              />
            ))}
          </Box>
        </Box>
      </AppDialog>
    </Box>
  );
}
