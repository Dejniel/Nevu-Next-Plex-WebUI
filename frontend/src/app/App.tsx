import React, { useEffect } from "react";
import BigReader from "components/BigReader";
import LibraryScreen from "components/LibraryScreen";
import { TitleDetailsScreen } from "features/title-details/public";
import { WatchTogetherFeature } from "features/watch-together/public";
import {
  ProfileBootstrapGate,
  SessionGate,
  useAuthSession,
  useServerSession,
} from "features/session/public";
import ConfirmModal from "components/ConfirmModal";
import Startup, { useStartupState } from "pages/Startup";
import { useWatchListCache } from "states/WatchListCache";
import { useLibraries } from "states/LibrariesState";
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
    <SessionGate>
      <ProfileBootstrapGate>
        <App />
      </ProfileBootstrapGate>
    </SessionGate>
  );
}

function AppTitleManager() {
  const server = useServerSession((state) => state.server);

  useEffect(() => {
    if (!server?.friendlyName) return;

    const capitalizedFriendlyName =
      server.friendlyName.charAt(0).toUpperCase() +
      server.friendlyName.slice(1);
    document.title = `${capitalizedFriendlyName} - Nevu`;
  }, [server]);

  useEffect(() => {
    document.title = "Nevu";
  }, []);

  return <></>;
}

function App() {
  const sessionRevision = useAuthSession((state) => state.revision);

  useEffect(() => {
    useWatchListCache.getState().reset();
    void useWatchListCache.getState().loadWatchListCache();
    useLibraries.getState().reset();
    void useLibraries.getState().load();
    void useServerSession.getState().refresh();

    const interval = setInterval(() => {
      void useWatchListCache.getState().loadWatchListCache();
    }, 60000);

    return () => clearInterval(interval);
  }, [sessionRevision]);

  return (
    <>
      <BigReader />
      <WatchTogetherFeature />
      <LibraryScreen />
      <AppTitleManager />
      <TitleDetailsScreen />
      <ConfirmModal />
      <AppRoutes />
    </>
  );
}

export default AppManager;
