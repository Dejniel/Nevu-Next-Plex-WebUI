import { useEffect } from "react";
import { useWatchTogetherSession } from "../model/session";
import WatchTogetherDialog from "./WatchTogetherDialog";
import WatchTogetherNotifications from "./WatchTogetherNotifications";
import WatchTogetherRuntime from "./WatchTogetherRuntime";

export default function WatchTogetherFeature() {
  useEffect(
    () => () => useWatchTogetherSession.getState().disconnect(),
    [],
  );

  return (
    <>
      <WatchTogetherRuntime />
      <WatchTogetherDialog />
      <WatchTogetherNotifications />
    </>
  );
}
