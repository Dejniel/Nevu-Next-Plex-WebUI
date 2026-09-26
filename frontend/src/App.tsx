import React, { useEffect } from "react";
import AppBar from "./components/AppBar";
import { Route, Routes } from "react-router-dom";

import Browse from "./pages/Browse";
import { Box } from "@mui/material";
import Watch from "./pages/Watch";
import Search from "./pages/Search";
import Home from "./pages/Home";
import Library from "./pages/Library";
import BigReader from "./components/BigReader";
import { useWatchListCache } from "./states/WatchListCache";
import Startup, { useStartupState } from "./pages/Startup";
import PerPlexedSync from "./components/PerPlexedSync";
import WaitingRoom from "./pages/WaitingRoom";
import ToastManager from "./components/ToastManager";
import LibraryScreen from "./components/LibraryScreen";
import { useSessionStore } from "./states/SessionState";
import Settings from "./pages/Settings";
import { useUserSettings } from "./states/UserSettingsState";
import MetaScreen from "./components/MetaScreen";
import ConfirmModal from "./components/ConfirmModal";
import AuthGate from "./components/AuthGate";
import { useUserSessionStore } from "./states/UserSession";

function AppManager() {
  const { loading } = useStartupState();
  const [showApp, setShowApp] = React.useState(false);
  const [fadeOut, setFadeOut] = React.useState(false);

  useEffect(() => {
    if (loading) return;

    setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => setShowApp(true), 500);
    }, 1000);
  }, [loading]);

  if (!showApp) {
    return (
      <div style={{ opacity: fadeOut ? 0 : 1, transition: "opacity 0.5s" }}>
        <Startup />
      </div>
    );
  }

  return (
    <AuthGate>
      <App />
    </AuthGate>
  );
}

function AppTitleManager() {
  const { PlexServer } = useSessionStore();

  useEffect(() => {
    console.log(PlexServer);
    if (!PlexServer?.friendlyName) return;

    const capitalizedFriendlyName =
      PlexServer.friendlyName.charAt(0).toUpperCase() +
      PlexServer.friendlyName.slice(1);
    document.title = `${capitalizedFriendlyName} - Nevu`;
  }, [PlexServer]);

  useEffect(() => {
    document.title = "Nevu";
  }, []);

  return <></>;
}

function App() {
  useEffect(() => {
    useUserSessionStore.getState().loadUser();
    useWatchListCache.getState().loadWatchListCache();
    useSessionStore.getState().fetchPlexServer();
    useUserSettings.getState().fetchSettings();

    const interval = setInterval(() => {
      useWatchListCache.getState().loadWatchListCache();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <BigReader />
      <PerPlexedSync />
      <ToastManager />
      <LibraryScreen />
      <AppTitleManager />
      <MetaScreen />
      <ConfirmModal />
      <Routes>
        <Route path="*" element={<AppBar />} />
        <Route path="/watch/:itemID" element={<></>} />
        <Route path="/sync/waitingroom" element={<></>} />
      </Routes>
      <Box
        sx={{
          width: "100%",
          height: "auto",
        }}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/browse/:libraryID" element={<Browse />} />
          <Route path="/watch/:itemID" element={<Watch />} />
          <Route path="/search/:query?" element={<Search />} />
          <Route path="/sync/waitingroom" element={<WaitingRoom />} />
          <Route
            path="/library/:libraryKey/dir/:dir/:subdir?"
            element={<Library />}
          />
          <Route path="/settings/*" element={<Settings />} />
        </Routes>
      </Box>
    </>
  );
}

export default AppManager;
