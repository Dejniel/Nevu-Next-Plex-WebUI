/* eslint-disable no-lone-blocks */
import { Theme } from "@emotion/react";
import {
  AppBar,
  Avatar,
  Backdrop,
  Box,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Popper,
  SxProps,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import React, { JSX, useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { getSearch, getTranscodeImageURL } from "../plex";
import { useUserSessionStore } from "../states/UserSession";
import {
  BookmarkRounded,
  FavoriteRounded,
  FullscreenRounded,
  LogoutRounded,
  MenuRounded,
  MoreVertRounded,
  PeopleRounded,
  SearchRounded,
  SettingsRounded,
  ShortcutRounded,
  SwitchAccountRounded,
} from "@mui/icons-material";
import { useSyncInterfaceState } from "./PerPlexedSync";
import { useSyncSessionState } from "../states/SyncSessionState";
import { config } from "..";
import { useBigReader } from "./BigReader";
import { useUserSettings } from "../states/UserSettingsState";
import { useAuthSession } from "../states/AuthSessionState";
import { SPONSOR_URL } from "../projectLinks";
import { useLibraries, LIBRARIES_CHANGED_EVENT } from "../states/LibrariesState";
import { normalizeLibraryNavigation, NavigationLibrary } from "../plex/libraryNavigation";
import LibraryActionsMenu from "./libraries/LibraryActionsMenu";

const BarSide: SxProps<Theme> = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
};

const menuDotsSx = {
  color: "text.secondary",
  opacity: 0.58,
  transition: "none",
  "&:hover": {
    color: "text.primary",
    opacity: 0.82,
    backgroundColor: "transparent",
    transform: "none",
  },
};

function Appbar() {
  const [scrollAtTop, setScrollAtTop] = useState(true);
  const location = useLocation();
  const { room } = useSyncSessionState();
  const [, setSearchParams] = useSearchParams();
  const { settings } = useUserSettings();

  const { user } = useUserSessionStore();
  const { activeProfile, switchProfile, signOut } = useAuthSession();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isWideDesktop = useMediaQuery(theme.breakpoints.up("xl"));
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

  const { libraries, load: loadLibraries } = useLibraries();
  const [libraryMenuAnchor, setLibraryMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuLibrary, setMenuLibrary] = useState<NavigationLibrary | null>(null);

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const navigate = useNavigate();

  useEffect(() => {
    void loadLibraries();
    const reload = () => void loadLibraries();
    window.addEventListener(LIBRARIES_CHANGED_EVENT, reload);
    return () => window.removeEventListener(LIBRARIES_CHANGED_EVENT, reload);
  }, [loadLibraries]);

  const navigationLibraries = (libraries || []).filter((library) =>
    ["movie", "show"].includes(library.type)
  );
  const libraryNavigation = normalizeLibraryNavigation(navigationLibraries, settings);
  const pinnedLibraries = libraryNavigation.pinned;
  const unpinnedLibraries = libraryNavigation.unpinned;
  const openLibraryMenu = (anchor: HTMLElement, library: NavigationLibrary) => {
    setMenuLibrary(library);
    setLibraryMenuAnchor(anchor);
  };

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
          {user?.friendlyName || user?.title || activeProfile?.title}
        </Typography>

        <Divider />

        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            window.open(SPONSOR_URL, "_blank", "noopener,noreferrer");
          }}
        >
          <ListItemIcon>
            <FavoriteRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sponsor</ListItemText>
        </MenuItem>

        {!config.DISABLE_NEVU_SYNC && (
          <MenuItem
            onClick={() => {
              useSyncInterfaceState.getState().setOpen(true);
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
--- Hint ---
You can right click on any library item at the top to view the entire library.

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
          onClick={() => {
            setAnchorEl(null);
            navigate("/settings/info");
          }}
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
      <LibraryActionsMenu
        anchorEl={libraryMenuAnchor}
        library={menuLibrary}
        libraries={navigationLibraries}
        onClose={() => {
          setLibraryMenuAnchor(null);
          if (isMobile) setDrawerOpen(false);
        }}
      />

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
          ...BarSide,
        }}
      >
        <img
          src={
            isMobile || isWideDesktop
              ? "/nevu-next-right.svg"
              : "/nevu.svg"
          }
          alt=""
          style={{
            width: isWideDesktop
              ? 200
              : isMobile
                ? "clamp(118px, 36vw, 150px)"
                : 100,
            maxWidth: "100%",
            height: "auto",
            objectFit: "contain",
          }}
        />

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
            {!libraries && <CircularProgress size="small" />}
            {pinnedLibraries.slice(0, 4).map((library) => (
              <HeadLink
                to={`/browse/${library.key}`}
                key={library.key}
                library={library}
                active={location.pathname.includes(`/browse/${library.key}`)}
                onMenu={openLibraryMenu}
              >
                {library.title}
              </HeadLink>
            ))}
            {libraries && (pinnedLibraries.length > 4 || unpinnedLibraries.length > 0) && (
              <LibrariesDropdown
                pinned={pinnedLibraries.slice(4)}
                unpinned={unpinnedLibraries}
                onMenu={openLibraryMenu}
              />
            )}
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
            <SearchBar />
            <IconButton
              onClick={() => {
                setSearchParams(
                  new URLSearchParams({
                    bkey: `/plextv/watchlist`,
                  })
                );
              }}
            >
              <BookmarkRounded />
            </IconButton>
          </>
        )}

        {room && (
          <IconButton
            onClick={() => {
              useSyncInterfaceState.getState().setOpen(true);
            }}
          >
            <PeopleRounded />
          </IconButton>
        )}

        <Avatar
          src={user?.thumb || activeProfile?.thumb}
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

          <SearchBar inDrawer onResultSelected={() => setDrawerOpen(false)} />

          <Divider />

          <List disablePadding>
            <ListItem disablePadding>
              <ListItemButton
                selected={location.pathname === "/"}
                onClick={() => { navigate("/"); setDrawerOpen(false); }}
              >
                <ListItemText primary="Home" />
              </ListItemButton>
            </ListItem>

            {!libraries && (
              <ListItem>
                <CircularProgress size={20} />
              </ListItem>
            )}

            {pinnedLibraries.map((library) => (
              <ListItem
                disablePadding
                key={library.key}
                secondaryAction={
                  <IconButton
                    edge="end"
                    onClick={(event) => openLibraryMenu(event.currentTarget, library)}
                    aria-label={`Actions for ${library.title}`}
                    sx={menuDotsSx}
                  >
                    <MoreVertRounded />
                  </IconButton>
                }
              >
                <ListItemButton
                  sx={{ pr: 7 }}
                  selected={location.pathname.includes(`/browse/${library.key}`)}
                  onClick={() => { navigate(`/browse/${library.key}`); setDrawerOpen(false); }}
                >
                  <ListItemText primary={library.title} />
                </ListItemButton>
              </ListItem>
            ))}

            {unpinnedLibraries.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="overline" color="text.secondary" sx={{ px: 2 }}>More</Typography>
                {unpinnedLibraries.map((library) => (
                  <ListItem
                    disablePadding
                    key={library.key}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        onClick={(event) => openLibraryMenu(event.currentTarget, library)}
                        aria-label={`Actions for ${library.title}`}
                        sx={menuDotsSx}
                      >
                        <MoreVertRounded />
                      </IconButton>
                    }
                  >
                    <ListItemButton
                      sx={{ pr: 7 }}
                      selected={location.pathname.includes(`/browse/${library.key}`)}
                      onClick={() => { navigate(`/browse/${library.key}`); setDrawerOpen(false); }}
                    >
                      <ListItemText primary={library.title} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </>
            )}

            <Divider sx={{ my: 1 }} />

            <ListItem disablePadding>
              <ListItemButton
                onClick={() => {
                  setSearchParams(new URLSearchParams({ bkey: `/plextv/watchlist` }));
                  setDrawerOpen(false);
                }}
              >
                <ListItemIcon><BookmarkRounded /></ListItemIcon>
                <ListItemText primary="Watchlist" />
              </ListItemButton>
            </ListItem>

            {!config.DISABLE_NEVU_SYNC && (
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => {
                    useSyncInterfaceState.getState().setOpen(true);
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
    </AppBar>
  );
}

export default Appbar;

function SearchBar({ onResultSelected, inDrawer }: { onResultSelected?: () => void; inDrawer?: boolean } = {}) {
  const [searchAnchorEl, setSearchAnchorEl] =
    React.useState<null | HTMLElement>(null);
  const searchOpen = Boolean(searchAnchorEl);
  const searchAnchorElRef = React.useRef<HTMLElement | null>(null);
  const [searchValue, setSearchValue] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<Plex.SearchResult[]>(
    []
  );
  const [searchLoading, setSearchLoading] = React.useState(false);

  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);

  useEffect(() => {
    // listen to strg + f

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "f" && e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        if (searchAnchorElRef.current) {
          searchAnchorElRef.current.blur();
          setSearchAnchorEl(null);
          return;
        }

        setSearchAnchorEl(document.getElementById("search-bar"));
        document.getElementById("search-bar")?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    searchAnchorElRef.current = searchAnchorEl;
  }, [searchAnchorEl]);

  useEffect(() => {
    setSelectedIndex(null);
    if (searchValue.length === 0) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);

    const delayDebounceFn = setTimeout(() => {
      getSearch(searchValue).then((res) => {
        if (!res) {
          setSearchLoading(false);
          return setSearchResults([]);
        }
        setSearchResults(
          res
            .filter(
              (item) =>
                (item.Metadata &&
                  ["movie", "show"].includes(item.Metadata.type)) ||
                item.Directory
            )
            .sort((a, b) => {
              // directories first
              if (a.Directory && !b.Directory) return -1;
              if (!a.Directory && b.Directory) return 1;
              return 0;
            })
            .slice(0, 8)
        );

        setSearchLoading(false);
      });
    }, 500); // Adjust the delay as needed

    return () => clearTimeout(delayDebounceFn);
  }, [searchValue]);

  return (
    <>
      <Backdrop
        open={searchOpen}
        sx={{
          zIndex: 10000,
        }}
        onClick={() => {
          setSearchAnchorEl(null);
        }}
      />
      <TextField
        id="search-bar"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchRounded />
            </InputAdornment>
          ),
        }}
        placeholder="Search"
        variant="outlined"
        size="small"
        onKeyDown={(e) => {
          switch (e.key) {
            case "Escape":
              setSearchAnchorEl(null);
              searchAnchorEl?.blur();
              break;
            case "ArrowDown":
              e.preventDefault();
              if (searchResults.length === 0) return;
              setSelectedIndex((prev) =>
                prev === null ? 0 : Math.min(prev + 1, searchResults.length - 1)
              );
              break;
            case "ArrowUp":
              e.preventDefault();
              if (searchResults.length === 0) return;
              if (selectedIndex === 0) return setSelectedIndex(null);

              setSelectedIndex((prev) =>
                prev === null ? 0 : Math.max(prev - 1, 0)
              );
              break;
            case "Tab":
              e.preventDefault();
              if (searchResults.length === 0) return;
              // if it gets to the last item, then set to null
              if (selectedIndex === searchResults.length - 1)
                return setSelectedIndex(null);
              setSelectedIndex((prev) =>
                prev === null ? 0 : Math.min(prev + 1, searchResults.length - 1)
              );
              break;
            case "Enter":
              if (searchValue.length === 0) return;

              if (selectedIndex !== null && searchResults.length > 0) {
                if (searchResults[selectedIndex].Metadata?.ratingKey) {
                  setSearchParams(
                    new URLSearchParams({
                      mid:
                        searchResults[selectedIndex].Metadata?.ratingKey || "",
                    })
                  );
                } else if (searchResults[selectedIndex].Directory) {
                  setSearchParams(
                    new URLSearchParams({
                      bkey: `/library/sections/${searchResults[selectedIndex].Directory?.librarySectionID}/genre/${searchResults[selectedIndex].Directory?.id}`,
                    })
                  );
                }
              } else {
                navigate(`/search/${encodeURIComponent(searchValue.trim())}`);
              }

              searchAnchorEl?.blur();
              setSearchAnchorEl(null);
              onResultSelected?.();
              break;
          }
        }}
        onChange={(e) => {
          setSearchValue(e.target.value);
          //navigate(`/search/${encodeURIComponent(e.target.value.trim())}`);
        }}
        onFocus={(e) => {
          setSearchAnchorEl(e.currentTarget);
        }}
        sx={{
          backgroundColor: "#121212AA",
          transition: "all 0.2s ease-in-out",
          zIndex: 11000,
          width: inDrawer ? "100%" : undefined,
        }}
        style={{
          ...(inDrawer
            ? { width: "100%" }
            : searchOpen
            ? { width: "20vw", zIndex: 10000 }
            : { width: "300px" }),
        }}
      />
      <Popper
        anchorEl={searchAnchorEl}
        open={searchOpen && searchValue.length > 0}
        placement="bottom-end"
        sx={{
          borderRadius: "4px",
          backgroundColor: "#121212AA",
          backdropFilter: "blur(10px)",
          transition: "width 0.2s ease-in-out",
          padding: "20px 10px",
          pt: "10px",

          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
        style={{
          ...(inDrawer
            ? { width: "260px", zIndex: 11000 }
            : searchOpen
            ? { width: "20vw", zIndex: 11000 }
            : { width: "300px" }),
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {searchLoading && (
          <Box
            sx={{ display: "flex", justifyContent: "center", width: "100%" }}
          >
            <CircularProgress />
          </Box>
        )}

        {!searchLoading && searchResults.length === 0 && (
          <Typography>No Results</Typography>
        )}

        {!searchLoading &&
          searchResults.length > 0 &&
          searchResults.map((item, index) => {
            if (item.Metadata) {
              return (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "flex-start",
                    width: "100%",
                    borderRadius: "4px",
                    backgroundColor: (theme) => theme.palette.background.paper,
                    padding: "7px 10px",

                    "&:hover": {
                      backgroundColor: (theme) => theme.palette.primary.dark,
                      transition: "all 0.2s ease-in-out",
                    },

                    ...(selectedIndex === index && {
                      backgroundColor: (theme) => theme.palette.primary.dark,
                    }),

                    transition: "all 0.4s ease-in-out",

                    userSelect: "none",
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    searchAnchorEl?.blur();
                    setSearchAnchorEl(null);
                    onResultSelected?.();
                    if (item.Metadata?.ratingKey) {
                      setSearchParams({
                        mid: item.Metadata.ratingKey,
                      });
                    }
                  }}
                >
                  <img
                    src={`${getTranscodeImageURL(
                      item.Metadata.thumb,
                      100,
                      100
                    )}`}
                    alt=""
                    style={{
                      aspectRatio: 1,
                      objectFit: "cover",
                      borderRadius: "4px",
                      width: 50,
                      height: 50,
                    }}
                  />

                  <Box sx={{ ml: 2, display: "flex", flexDirection: "column" }}>
                    <Typography>{item.Metadata.title}</Typography>

                    <Typography
                      sx={{
                        fontSize: 12,
                        color: "#777",
                      }}
                    >
                      {item.Metadata.librarySectionTitle}
                    </Typography>
                  </Box>
                </Box>
              );
            } else if (item.Directory) {
              return (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "flex-start",
                    width: "100%",
                    borderRadius: "4px",
                    backgroundColor: (theme) => theme.palette.background.paper,
                    padding: "7px 10px",

                    "&:hover": {
                      backgroundColor: (theme) => theme.palette.primary.dark,
                      transition: "all 0.2s ease-in-out",
                    },

                    ...(selectedIndex === index && {
                      backgroundColor: (theme) => theme.palette.primary.dark,
                    }),

                    transition: "all 0.4s ease-in-out",

                    userSelect: "none",
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    console.log("test");
                    e.stopPropagation();
                    e.preventDefault();
                    setSearchParams(
                      new URLSearchParams({
                        bkey: `/library/sections/${item.Directory?.librarySectionID}/genre/${item.Directory?.id}`,
                      })
                    );
                    searchAnchorEl?.blur();
                    setSearchAnchorEl(null);
                    onResultSelected?.();
                  }}
                >
                  <Typography>
                    {item.Directory.librarySectionTitle} - {item.Directory.tag}
                  </Typography>
                </Box>
              );
            }
            return null;
          })}
      </Popper>
    </>
  );
}

function LibrariesDropdown({
  pinned,
  unpinned,
  onMenu,
}: {
  pinned: NavigationLibrary[];
  unpinned: NavigationLibrary[];
  onMenu: (anchor: HTMLElement, library: NavigationLibrary) => void;
}) {
  const [librariesAnchorEl, setLibrariesAnchorEl] = React.useState<null | HTMLElement>(null);
  const librariesOpen = Boolean(librariesAnchorEl);
  const navigate = useNavigate();
  const libraries = [...pinned, ...unpinned];

  return (
    <>
      <Box
        sx={{
          position: "relative",
          height: "100%",
          display: "flex",
          alignItems: "center",
        }}
        onMouseEnter={(e) => setLibrariesAnchorEl(e.currentTarget)}
        onMouseLeave={() => setLibrariesAnchorEl(null)}
      >
        <Typography
          sx={{
            textDecoration: "none",
            color: "inherit",
            fontWeight: 500,
            transition: "all 0.2s ease-in-out",
            fontFamily: '"Inter Variable", sans-serif',
            userSelect: "none",
            cursor: "pointer",
            "&:hover": {
              color: (theme) => theme.palette.primary.main,
            },
          }}
        >
          +{libraries.length} more
        </Typography>

        <Popper
          anchorEl={librariesAnchorEl}
          open={librariesOpen}
          placement="bottom-start"
          sx={{
            zIndex: 12000,
            mt: 1,
          }}
        >
          <Box
            sx={{
              backgroundColor: "#121212EE",
              backdropFilter: "blur(20px)",
              borderRadius: "4px",
              boxShadow: "0px 4px 20px 0px #000000AA",
              padding: "15px",
              maxWidth: "600px",
              maxHeight: "400px",
              minWidth: "300px",
              overflow: "hidden",
            }}
            onMouseEnter={() => setLibrariesAnchorEl(librariesAnchorEl)}
            onMouseLeave={() => setLibrariesAnchorEl(null)}
          >
            <Box
              sx={{
                maxHeight: "370px",
                overflowY: "auto",
                paddingRight: "5px",
                "&::-webkit-scrollbar": {
                  width: "4px",
                },
                "&::-webkit-scrollbar-track": {
                  background: "transparent",
                },
                "&::-webkit-scrollbar-thumb": {
                  background: (theme) => theme.palette.primary.main + "60",
                  borderRadius: "2px",
                },
                "&::-webkit-scrollbar-thumb:hover": {
                  background: (theme) => theme.palette.primary.main + "80",
                },
              }}
            >
              {libraries.map((library, index) => (
                <React.Fragment key={library.key}>
                  {index === pinned.length && unpinned.length > 0 && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="overline" color="text.secondary" sx={{ px: 1 }}>Unpinned</Typography>
                    </>
                  )}
                  <Box
                    sx={{
                      px: 1.5,
                      minHeight: 44,
                      display: "flex",
                      alignItems: "center",
                      borderRadius: "4px",
                      cursor: "pointer",
                      "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" },
                    }}
                    onClick={() => {
                      navigate(`/browse/${library.key}`);
                      setLibrariesAnchorEl(null);
                    }}
                  >
                    <Typography noWrap sx={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{library.title}</Typography>
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onMenu(librariesAnchorEl || event.currentTarget, library);
                        setLibrariesAnchorEl(null);
                      }}
                      aria-label={`Actions for ${library.title}`}
                      sx={{ ...menuDotsSx, width: 32, height: 32 }}
                    >
                      <MoreVertRounded fontSize="small" />
                    </IconButton>
                  </Box>
                </React.Fragment>
              ))}
            </Box>
          </Box>
        </Popper>
      </Box>
    </>
  );
}

function HeadLink({
  to,
  library,
  children,
  active,
  onMenu,
}: {
  to: string;
  library?: Plex.LibarySection;
  children: React.ReactNode;
  active?: boolean;
  onMenu?: (anchor: HTMLElement, library: NavigationLibrary) => void;
}): JSX.Element {
  const [, setSearchParams] = useSearchParams();
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        position: "relative",
        mr: library && onMenu ? 1 : 0,
      }}
    >
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
        onContextMenu={(e) => {
          e.preventDefault();
          if (library)
            setSearchParams(new URLSearchParams({ bkey: `/library/sections/${library.key}/all` }));
        }}
        aria-current={active ? "page" : undefined}
      >
        {children}
      </Link>
      {library && onMenu && (
        <IconButton
          className="library-menu"
          size="small"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onMenu(event.currentTarget, library);
          }}
          aria-label={`Actions for ${library.title}`}
          sx={{
            ...menuDotsSx,
            position: "absolute",
            left: "calc(100% + 2px)",
            top: "calc(50% - 12px)",
            width: 24,
            height: 24,
            p: 0,
          }}
        >
          <MoreVertRounded fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}
