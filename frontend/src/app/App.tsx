import React, { useEffect } from "react";
import BigReader from "components/BigReader";
import PerPlexedSync from "components/PerPlexedSync";
import ToastManager from "components/ToastManager";
import LibraryScreen from "components/LibraryScreen";
import MetaScreen from "components/MetaScreen";
import ConfirmModal from "components/ConfirmModal";
import AuthGate from "components/AuthGate";
import ProfileBootstrapGate from "components/ProfileBootstrapGate";
import Startup, { useStartupState } from "pages/Startup";
import { useWatchListCache } from "states/WatchListCache";
import { useSessionStore } from "states/SessionState";
import { useUserSessionStore } from "states/UserSession";
import AppRoutes from "./AppRoutes";

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
      <ProfileBootstrapGate>
        <App />
      </ProfileBootstrapGate>
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
      <AppRoutes />
    </>
  );
}

export default AppManager;
