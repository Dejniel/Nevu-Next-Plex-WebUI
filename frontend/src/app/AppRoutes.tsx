import { Box } from "@mui/material";
import { Route, Routes } from "react-router-dom";
import AppBar from "components/AppBar";
import { Browse } from "features/library/public";
import Home from "pages/Home";
import Library from "pages/Library";
import Search from "pages/Search";
import Settings from "pages/Settings";
import WaitingRoom from "pages/WaitingRoom";
import { PlaybackScreen } from "features/playback/public";

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
          <Route path="/" element={<Home />} />
          <Route path="/browse/:libraryID" element={<Browse />} />
          <Route path="/watch/:itemID" element={<PlaybackScreen />} />
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
