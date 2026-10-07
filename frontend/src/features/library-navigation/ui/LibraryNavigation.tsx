import { MoreVertRounded } from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemText,
  Popper,
  Typography,
} from "@mui/material";
import { isBrowsableLibraryType, useLibraries } from "entities/library/model";
import { useUserSettings } from "features/settings/model";
import { Fragment, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { StretchedLink } from "shared/ui";
import {
  isLibraryRouteActive,
  normalizeLibraryNavigation,
  type NavigationLibrary,
} from "../model/navigation";
import LibraryActionsMenu from "./LibraryActionsMenu";

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

export default function LibraryNavigation({
  variant,
  onNavigate,
}: {
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const settings = useUserSettings((state) => state.settings);
  const { data: libraries } = useLibraries();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuLibrary, setMenuLibrary] = useState<NavigationLibrary | null>(null);

  const navigation = normalizeLibraryNavigation(
    (libraries || []).filter((library) => isBrowsableLibraryType(library.type)),
    settings,
  );
  const openMenu = (anchor: HTMLElement, library: NavigationLibrary) => {
    setMenuAnchor(anchor);
    setMenuLibrary(library);
  };
  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuLibrary(null);
    onNavigate?.();
  };

  return (
    <>
      <LibraryActionsMenu
        anchorEl={menuAnchor}
        library={menuLibrary}
        libraries={navigation.ordered}
        onClose={closeMenu}
      />
      {variant === "desktop" ? (
        <DesktopLibraries
          loaded={Boolean(libraries)}
          pathname={location.pathname}
          pinned={navigation.pinned}
          unpinned={navigation.unpinned}
          onMenu={openMenu}
        />
      ) : (
        <MobileLibraries
          loaded={Boolean(libraries)}
          pathname={location.pathname}
          pinned={navigation.pinned}
          unpinned={navigation.unpinned}
          onMenu={openMenu}
          onNavigate={onNavigate}
        />
      )}
    </>
  );
}

function DesktopLibraries({
  loaded,
  pathname,
  pinned,
  unpinned,
  onMenu,
}: NavigationProps) {
  return (
    <>
      {!loaded && <CircularProgress size={20} />}
      {pinned.slice(0, 4).map((library) => (
        <LibraryLink
          key={library.key}
          library={library}
          active={isLibraryRouteActive(pathname, library.key)}
          onMenu={onMenu}
        />
      ))}
      {loaded && (pinned.length > 4 || unpinned.length > 0) && (
        <LibrariesDropdown
          pinned={pinned.slice(4)}
          unpinned={unpinned}
          onMenu={onMenu}
        />
      )}
    </>
  );
}

function MobileLibraries({
  loaded,
  pathname,
  pinned,
  unpinned,
  onMenu,
  onNavigate,
}: NavigationProps & { onNavigate?: () => void }) {
  return (
    <>
      {!loaded && (
        <ListItem>
          <CircularProgress size={20} />
        </ListItem>
      )}
      {pinned.map((library) => (
        <MobileLibraryLink
          key={library.key}
          library={library}
          active={isLibraryRouteActive(pathname, library.key)}
          onMenu={onMenu}
          onNavigate={onNavigate}
        />
      ))}
      {unpinned.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography variant="overline" sx={{ color: "text.secondary", px: 2 }}>
            More
          </Typography>
          {unpinned.map((library) => (
            <MobileLibraryLink
              key={library.key}
              library={library}
              active={isLibraryRouteActive(pathname, library.key)}
              onMenu={onMenu}
              onNavigate={onNavigate}
            />
          ))}
        </>
      )}
    </>
  );
}

interface NavigationProps {
  loaded: boolean;
  pathname: string;
  pinned: NavigationLibrary[];
  unpinned: NavigationLibrary[];
  onMenu: (anchor: HTMLElement, library: NavigationLibrary) => void;
}

function MobileLibraryLink({
  library,
  active,
  onMenu,
  onNavigate,
}: {
  library: NavigationLibrary;
  active: boolean;
  onMenu: NavigationProps["onMenu"];
  onNavigate?: () => void;
}) {
  return (
    <ListItem
      disablePadding
      secondaryAction={
        <IconButton
          edge="end"
          onClick={(event) => onMenu(event.currentTarget, library)}
          aria-label={`Actions for ${library.title}`}
          sx={menuDotsSx}
        >
          <MoreVertRounded />
        </IconButton>
      }
    >
      <ListItemButton
        component={Link}
        to={`/browse/${library.key}`}
        sx={{ pr: 7 }}
        selected={active}
        onClick={onNavigate}
      >
        <ListItemText primary={library.title} />
      </ListItemButton>
    </ListItem>
  );
}

function LibrariesDropdown({
  pinned,
  unpinned,
  onMenu,
}: {
  pinned: NavigationLibrary[];
  unpinned: NavigationLibrary[];
  onMenu: NavigationProps["onMenu"];
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const libraries = [...pinned, ...unpinned];

  return (
    <Box
      sx={{ position: "relative", height: "100%", display: "flex", alignItems: "center" }}
      onMouseEnter={(event) => setAnchor(event.currentTarget)}
      onMouseLeave={() => setAnchor(null)}
    >
      <Typography
        sx={{
          color: "inherit",
          fontWeight: 500,
          fontFamily: '"Inter Variable", sans-serif',
          userSelect: "none",
          cursor: "pointer",
          "&:hover": { color: "primary.main" },
        }}
      >
        +{libraries.length} more
      </Typography>
      <Popper anchorEl={anchor} open={Boolean(anchor)} placement="bottom-start" sx={{ zIndex: 12000, mt: 1 }}>
        <Box
          onMouseEnter={() => setAnchor(anchor)}
          onMouseLeave={() => setAnchor(null)}
          sx={{
            backgroundColor: "#121212EE",
            backdropFilter: "blur(20px)",
            borderRadius: "4px",
            boxShadow: "0px 4px 20px 0px #000000AA",
            p: "15px",
            maxWidth: 600,
            minWidth: 300,
            maxHeight: 400,
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              maxHeight: 370,
              overflowY: "auto",
              pr: "5px",
              "&::-webkit-scrollbar": { width: 4 },
              "&::-webkit-scrollbar-track": { background: "transparent" },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: (theme) => `${theme.palette.primary.main}60`,
                borderRadius: 2,
              },
              "&::-webkit-scrollbar-thumb:hover": {
                backgroundColor: (theme) => `${theme.palette.primary.main}80`,
              },
            }}
          >
            {libraries.map((library, index) => (
              <Fragment key={library.key}>
                {index === pinned.length && unpinned.length > 0 && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="overline" sx={{ color: "text.secondary", px: 1 }}>
                      Unpinned
                    </Typography>
                  </>
                )}
                <Box
                  sx={{
                    px: 1.5,
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                    borderRadius: "4px",
                    position: "relative",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" },
                  }}
                >
                  <StretchedLink
                    to={`/browse/${library.key}`}
                    label={`Open ${library.title}`}
                    onClick={() => setAnchor(null)}
                  />
                  <Typography
                    noWrap
                    sx={{ flex: 1, fontSize: 14, fontWeight: 500, pointerEvents: "none" }}
                  >
                    {library.title}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onMenu(anchor || event.currentTarget, library);
                      setAnchor(null);
                    }}
                    aria-label={`Actions for ${library.title}`}
                    sx={{ ...menuDotsSx, width: 32, height: 32, zIndex: 2 }}
                  >
                    <MoreVertRounded fontSize="small" />
                  </IconButton>
                </Box>
              </Fragment>
            ))}
          </Box>
        </Box>
      </Popper>
    </Box>
  );
}

function LibraryLink({
  library,
  active,
  onMenu,
}: {
  library: NavigationLibrary;
  active: boolean;
  onMenu: NavigationProps["onMenu"];
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        position: "relative",
        mr: 1,
      }}
    >
      <Link
        className={`head-link${active ? " head-link-active" : ""}`}
        to={`/browse/${library.key}`}
        aria-current={active ? "page" : undefined}
      >
        {library.title}
      </Link>
      <IconButton
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
    </Box>
  );
}
