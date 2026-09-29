import { Theme } from "@emotion/react";
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  SxProps,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import React, { JSX, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BookmarkRounded,
  FavoriteRounded,
  FullscreenRounded,
  LogoutRounded,
  MenuRounded,
  PeopleRounded,
  SettingsRounded,
  ShortcutRounded,
  SwitchAccountRounded,
} from "@mui/icons-material";
import {
  useWatchTogetherDialog,
  useWatchTogetherSession,
} from "features/watch-together/public";
import { config } from "shared/config/runtime";
import { useBigReader } from "shared/ui";
import { useAuthSession } from "features/session/public";
import { SPONSOR_URL } from "shared/config/projectLinks";
import { LibraryNavigation } from "features/library-navigation/public";
import { SearchBar } from "features/search/public";
import { libraryBrowseTo } from "shared/lib/navigation";

const BarSide: SxProps<Theme> = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
};

function Appbar() {
  const [scrollAtTop, setScrollAtTop] = useState(true);
  const location = useLocation();
  const { room } = useWatchTogetherSession();

  const { activeProfile, activeUser, switchProfile, signOut } = useAuthSession();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrollAtTop(window.scrollY === 0);
    };

    window.addEventListener("scroll", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  return (
    <AppBar
      sx={{
        position: "fixed",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        px: { xs: 2, sm: 3, md: 6 },
        py: 0,
        height: 64,
        transition: "all 0.5s ease-in-out",

        bgcolor: (theme) => (scrollAtTop ? "#00000000" : theme.palette.background.default + "88"),
        backdropFilter: scrollAtTop ? "blur(0px)" : "blur(20px)",
        boxShadow: scrollAtTop ? "none" : "0px 0px 10px 0px #000000AA",

        borderRadius: "0px",
        border: "none",

        borderBottomLeftRadius: "4px",
        borderBottomRightRadius: "4px",
        zIndex: 99,
      }}
    >
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        sx={{}}
      >
        <Typography
          sx={{
            width: "100%",
            textAlign: "center",
            fontWeight: 600,
            px: 2,
            fontSize: 18,
          }}
        >
          {activeUser?.friendlyName || activeUser?.title || activeProfile?.title}
        </Typography>

        <Divider />

        <MenuItem
          component="a"
          href={SPONSOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setAnchorEl(null)}
        >
          <ListItemIcon>
            <FavoriteRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sponsor</ListItemText>
        </MenuItem>

        {!config.DISABLE_NEVU_SYNC && (
          <MenuItem
            onClick={() => {
              useWatchTogetherDialog.getState().setOpen(true);
              setAnchorEl(null);
            }}
          >
            <ListItemIcon>
              <PeopleRounded fontSize="small" />
            </ListItemIcon>
            <ListItemText>Watch2Gether</ListItemText>
          </MenuItem>
        )}

        <MenuItem
          onClick={() => {
            // toggle Fullscreen
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
          }}
        >
          <ListItemIcon>
            <FullscreenRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Fullscreen</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            useBigReader.getState().setBigReader(`
--- Browsing ---
CTRL + F - Search

--- Playback ---
Space / k - Play/Pause
Left Arrow / j - Back 10s
Right Arrow / l - Forward 10s
Up Arrow - Volume Up
Down Arrow - Volume Down 
S - Skip onscreen markers (intro, credits, etc)
            `);
          }}
        >
          <ListItemIcon>
            <ShortcutRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Shortcuts</ListItemText>
        </MenuItem>

        <MenuItem
          component={Link}
          to="/settings/info"
          onClick={() => setAnchorEl(null)}
        >
          <ListItemIcon>
            <SettingsRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Settings</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            switchProfile();
          }}
        >
          <ListItemIcon>
            <SwitchAccountRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Switch profile</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            signOut();
          }}
        >
          <ListItemIcon>
            <LogoutRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sign out of Plex</ListItemText>
        </MenuItem>
      </Menu>
      {/* Mobile: hamburger button */}
      {isMobile && (
        <IconButton
          onClick={() => setDrawerOpen(true)}
          sx={{ color: "inherit" }}
        >
          <MenuRounded />
        </IconButton>
      )}

      <Box
        sx={{
          justifyContent: "flex-start",
          minWidth: 0,
          ...BarSide,
        }}
      >
        <Box
          component={Link}
          to="/"
          aria-label="Go to home"
          sx={{
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            flexShrink: 1,
            borderRadius: 0.5,
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: 3,
            },
          }}
        >
          <img
            src="/nevu-next-right.svg"
            alt="Nevu Next"
            style={{
              width: isMobile
                ? "clamp(118px, 36vw, 150px)"
                : "clamp(120px, 14vw, 200px)",
              maxWidth: "100%",
              height: "auto",
              objectFit: "contain",
            }}
          />
        </Box>

        {/* Desktop: nav links */}
        {!isMobile && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: { md: 4.5, xl: 5 },
              ml: 6,
              height: "100%",
            }}
          >
            <HeadLink to="/" active={location.pathname === "/"}>
              Home
            </HeadLink>
            <LibraryNavigation variant="desktop" />
          </Box>
        )}
      </Box>

      <Box
        sx={{
          justifyContent: "flex-end",
          ...BarSide,
          gap: { xs: 1, md: 2 },
        }}
      >
        {/* Desktop: search bar and bookmark */}
        {!isMobile && (
          <>
            <SearchBar enableShortcut={!isMobile} />
            <IconButton
              component={Link}
              to={libraryBrowseTo(location, "/plextv/watchlist")}
              aria-label="Open watchlist"
            >
              <BookmarkRounded />
            </IconButton>
          </>
        )}

        {room && (
          <IconButton
            onClick={() => {
              useWatchTogetherDialog.getState().setOpen(true);
            }}
          >
            <PeopleRounded />
          </IconButton>
        )}

        <Avatar
          src={activeUser?.thumb || activeProfile?.thumb}
          variant="square"
          alt=""
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            width: { xs: 36, md: 45 },
            height: { xs: 36, md: 45 },
            borderRadius: "4px",
            cursor: "pointer",

            "&:hover": {
              boxShadow: (theme) =>
                `0px 0px 20px 0px ${theme.palette.primary.main}`,
            },
            transition: "all 0.2s ease-in-out",
          }}
        />
      </Box>

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          PaperProps={{
            sx: {
              width: 280,
              backgroundColor: "#121212EE",
              backdropFilter: "blur(20px)",
            },
          }}
        >
          <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <img
              src="/nevu-next-below.svg"
              alt=""
              width="140"
              style={{ objectFit: "contain" }}
            />

            <SearchBar
              inDrawer
              enableShortcut={drawerOpen}
              onResultSelected={() => setDrawerOpen(false)}
            />

            <Divider />

            <List disablePadding>
              <ListItem disablePadding>
                <ListItemButton
                  component={Link}
                  to="/"
                  selected={location.pathname === "/"}
                  onClick={() => setDrawerOpen(false)}
                >
                  <ListItemText primary="Home" />
                </ListItemButton>
              </ListItem>

              <LibraryNavigation
                variant="mobile"
                onNavigate={() => setDrawerOpen(false)}
              />

              <Divider sx={{ my: 1 }} />

              <ListItem disablePadding>
                <ListItemButton
                  component={Link}
                  to={libraryBrowseTo(location, "/plextv/watchlist")}
                  onClick={() => setDrawerOpen(false)}
                >
                  <ListItemIcon><BookmarkRounded /></ListItemIcon>
                  <ListItemText primary="Watchlist" />
                </ListItemButton>
              </ListItem>

              {!config.DISABLE_NEVU_SYNC && (
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => {
                      useWatchTogetherDialog.getState().setOpen(true);
                      setDrawerOpen(false);
                    }}
                  >
                    <ListItemIcon><PeopleRounded /></ListItemIcon>
                    <ListItemText primary="Watch2Gether" />
                  </ListItemButton>
                </ListItem>
              )}
            </List>
          </Box>
        </Drawer>
      )}
    </AppBar>
  );
}

export default Appbar;

function HeadLink({
  to,
  children,
  active,
}: {
  to: string;
  children: React.ReactNode;
  active?: boolean;
}): JSX.Element {
  return (
    <Link
      className={`head-link${active ? " head-link-active" : ""}`}
      to={to}
      style={{
        textDecoration: "none",
        color: "inherit",
        fontWeight: 500,
        transition: "all 0.2s ease-in-out",
        fontFamily: '"Inter Variable", sans-serif',
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
