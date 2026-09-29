import { Box, Typography } from "@mui/material";
import React from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import SettingsInfo from "./SettingsInfo";
import SettingsPlayback from "./SettingsPlayback";
import SettingsAccount from "./SettingsAccount";
import SettingsSharing from "./SettingsSharing";
import SettingsLibrariesAdmin from "./SettingsLibrariesAdmin";
import { useCanManageServer } from "features/session/public";

function SettingsScreen() {
  const canManageServer = useCanManageServer();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        alignItems: "flex-start",
        justifyContent: "flex-start",
        minHeight: "100vh",
        width: "100vw",
        overflow: "auto",
        pt: "64px",
        px: "20px",
        pb: "20px",
      }}
    >
      <Box
        sx={{
          width: { xs: "100%", md: "260px" },
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#181818",
          padding: "10px",
          borderRadius: "10px",
        }}
      >
        <SettingsDivider title="General" />
        <SettingsItem title="Account" link="/settings/account" />
        <SettingsItem title="Playback" link="/settings/experience-playback" />
        <SettingsItem title="About" link="/settings/info" />
        {canManageServer && (
          <>
            <SettingsDivider title="Manage" />
            <SettingsItem title="Libraries" link="/settings/manage-libraries" />
            <SettingsItem title="Sharing" link="/settings/sharing" />
          </>
        )}
      </Box>

      <Box
        sx={{
          width: "100%",
          maxWidth: "900px",
          minHeight: { xs: "auto", md: "calc(100vh - 84px)" },
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          backgroundColor: "#18181855",
          padding: "20px",
          borderRadius: "10px",
          ml: { xs: 0, md: "auto" },
          mr: "auto",
          mt: { xs: 2, md: 0 },
        }}
      >
        <Routes>
          <Route path="/info" element={<SettingsInfo />} />
          <Route path="/account" element={<SettingsAccount />} />
          <Route path="/sharing" element={<SettingsSharing />} />
          <Route path="/manage-libraries" element={<SettingsLibrariesAdmin />} />

          <Route path="/experience-playback" element={<SettingsPlayback />} />
          <Route
            path="/experience-recommendations"
            element={<Navigate to="/settings/experience-playback" replace />}
          />
          <Route
            path="/experience-libraries"
            element={<Navigate to="/settings/manage-libraries" replace />}
          />
        </Routes>
      </Box>
    </Box>
  );
}

export default SettingsScreen;

function SettingsDivider({ title }: { title: string }) {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        padding: "5px",
        borderRadius: "10px",
      }}
    >
      <Typography
        sx={{
          color: "#AAA",
          fontSize: "1.2rem",
          userSelect: "none",
        }}
      >
        {title}
      </Typography>
    </Box>
  );
}

function SettingsItem({ title, link }: { title: string; link: string }) {
  const { pathname } = useLocation();

  return (
    <Link to={link}>
      <Box
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          padding: "5px",
          borderRadius: "10px",
          pl: "18px",

          transition: "all 0.3s ease",

          "&:hover": {
            backgroundColor: "#333",
          },
        }}
      >
        <Typography
          sx={{
            color: theme => pathname === link ? theme.palette.primary.main : theme.palette.text.primary,
            fontSize: "1rem",
            userSelect: "none",
          }}
        >
          {title}
        </Typography>
      </Box>
    </Link>
  );
}
