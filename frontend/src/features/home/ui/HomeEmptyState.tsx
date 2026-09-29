import { AddRounded, RefreshRounded } from "@mui/icons-material";
import { Box, Button, Typography } from "@mui/material";
import { Link } from "react-router-dom";

export default function HomeEmptyState({
  canManageServer,
  onRefresh,
}: {
  canManageServer: boolean;
  onRefresh: () => void;
}) {
  return (
    <Box
      sx={{
        mt: "64px",
        minHeight: "calc(100svh - 64px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        px: 3,
        py: 8,
        background: "radial-gradient(ellipse at 50% 45%, rgba(99,102,241,0.12), transparent 65%)",
      }}
    >
      <Box
        component="img"
        src="/nevu-next-below.svg"
        alt="Nevu Next"
        sx={{ width: { xs: "min(75vw, 320px)", sm: 440 }, height: "auto", mb: 5 }}
      />
      <Typography
        component="h1"
        sx={{ fontSize: { xs: "1.8rem", sm: "2.5rem" }, fontWeight: 700, maxWidth: 640 }}
      >
        Your next great watch starts here.
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 520, lineHeight: 1.7 }}>
        {canManageServer
          ? "Add movies or TV shows to Plex and make yourself at home. Your collection will appear here once a library has been scanned."
          : "No movies or TV shows are available for this profile yet. Ask the server owner to add media or share a library with you."}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 1.5, mt: 4 }}>
        {canManageServer && (
          <Button
            component={Link}
            to="/settings/manage-libraries"
            variant="contained"
            startIcon={<AddRounded />}
            sx={{ px: 3, py: 1.25 }}
          >
            Manage libraries
          </Button>
        )}
        <Button variant="text" startIcon={<RefreshRounded />} onClick={onRefresh}>
          Check again
        </Button>
      </Box>
    </Box>
  );
}
