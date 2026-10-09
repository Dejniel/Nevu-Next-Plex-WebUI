import { Typography, Box } from "@mui/material";
import { useUserSettings } from "../model/userSettings";
import CheckBoxOption from "./CheckBoxOption";

function SettingsPlayback() {
  const { settings, setSetting } = useUserSettings();

  return (
    <>
      <Typography variant="h4">Experience - Playback</Typography>

      <Box
        sx={{
          mt: 2,
          width: "100%",
          height: "40px",
          backgroundColor: "#181818",
          borderRadius: "10px",
        }}
      />

      <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        <CheckBoxOption
          title="Disable Watchscreen Darkening"
          subtitle="Disables the darkening effect when interacting with the watchscreen."
          checked={settings.DISABLE_WATCHSCREEN_DARKENING === "true"}
          onChange={() => {
            setSetting(
              "DISABLE_WATCHSCREEN_DARKENING",
              settings["DISABLE_WATCHSCREEN_DARKENING"] === "true"
                ? "false"
                : "true"
            );
          }}
        />

        <CheckBoxOption
          title="Auto-Match Tracks"
          subtitle="Automatically select subtitles and audio tracks based on your previous choices. (Same language for each episode of a show)"
          checked={settings.AUTO_MATCH_TRACKS === "true"}
          onChange={() => {
            setSetting(
              "AUTO_MATCH_TRACKS",
              settings["AUTO_MATCH_TRACKS"] === "true" ? "false" : "true"
            );
          }}
        />

        <CheckBoxOption
          title="Auto-Play Next Episode"
          subtitle="Automatically play the next episode when the current one ends."
          checked={settings.AUTO_NEXT_EP === "true"}
          onChange={() => {
            setSetting(
              "AUTO_NEXT_EP",
              settings["AUTO_NEXT_EP"] === "true" ? "false" : "true"
            );
          }}
        />
      </Box>
    </>
  );
}

export default SettingsPlayback;
