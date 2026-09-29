import { Box } from "@mui/material";
import { Route, Routes } from "react-router-dom";
import AppBar from "components/AppBar";
import { HomeScreen } from "features/home/public";
import { Browse } from "features/library/public";
import Search from "pages/Search";
import { SettingsScreen } from "features/settings/public";
import { PlaybackScreen } from "features/playback/public";
import { WaitingRoomScreen } from "features/watch-together/public";

export default function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="*" element={<AppBar />} />
        <Route path="/watch/:itemID" element={<></>} />
        <Route path="/sync/waitingroom" element={<></>} />
      </Routes>
      <Box sx={{ width: "100%", height: "auto" }}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/browse/:libraryID" element={<Browse />} />
          <Route path="/watch/:itemID" element={<PlaybackScreen />} />
          <Route path="/search/:query?" element={<Search />} />
          <Route path="/sync/waitingroom" element={<WaitingRoomScreen />} />
          <Route path="/settings/*" element={<SettingsScreen />} />
        </Routes>
      </Box>
    </>
  );
}
