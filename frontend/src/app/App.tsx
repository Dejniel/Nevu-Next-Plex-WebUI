import React, { useEffect } from "react";
import { BigReader } from "shared/ui";
import { LibraryScreen } from "features/library/public";
import { TitleDetailsScreen } from "features/title-details/public";
import { WatchTogetherFeature } from "features/watch-together/public";
import {
  ProfileBootstrapGate,
  SessionGate,
  useAuthSession,
  useServerSession,
} from "features/session/public";
import { MusicProvider } from "features/music/public";
import { useCatalogScrollRestoration } from "./useCatalogScrollRestoration";
import Startup, { useStartupState } from "./startup/Startup";
import AppRoutes from "./AppRoutes";
import { useBrowseSynchronization } from "./useBrowseSynchronization";

function AppManager() {
  const { loading } = useStartupState();
  const serverName = useServerSession((state) => state.server?.friendlyName);
  const [showApp, setShowApp] = React.useState(false);
  const [fadeOut, setFadeOut] = React.useState(false);

  useEffect(() => {
    document.title = serverName
      ? `Plex Nevu Next - ${serverName}`
      : "Plex Nevu Next";
  }, [serverName]);

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

function App() {
  useCatalogScrollRestoration();
  const sessionRevision = useAuthSession((state) => state.revision);
  useBrowseSynchronization(sessionRevision);

  useEffect(() => {
    void useServerSession.getState().refresh();
  }, [sessionRevision]);

  return (
    <>
      <BigReader />
      <WatchTogetherFeature />
      <LibraryScreen />
      <TitleDetailsScreen />
      <MusicProvider>
        <AppRoutes />
      </MusicProvider>
    </>
  );
}

export default AppManager;
