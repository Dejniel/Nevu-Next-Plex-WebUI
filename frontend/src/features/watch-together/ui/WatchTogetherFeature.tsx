import WatchTogetherDialog from "./WatchTogetherDialog";
import WatchTogetherNotifications from "./WatchTogetherNotifications";
import WatchTogetherRuntime from "./WatchTogetherRuntime";

export default function WatchTogetherFeature() {
  return (
    <>
      <WatchTogetherRuntime />
      <WatchTogetherDialog />
      <WatchTogetherNotifications />
    </>
  );
}
