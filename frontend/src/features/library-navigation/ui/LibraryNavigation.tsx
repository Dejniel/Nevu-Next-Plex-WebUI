import {
  AppsRounded,
  ArrowDropDownRounded,
  MoreVertRounded,
} from "@mui/icons-material";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import { isBrowsableLibraryType, useLibraries } from "entities/library/model";
import { useUserSettings } from "features/settings/model";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { overlayContainer } from "shared/lib/overlayContainer";
import {
  useToolbarOverflow,
  type ToolbarMeasurements,
} from "shared/lib/useToolbarOverflow";
import {
  isLibraryRouteActive,
  libraryNavigationOverflow,
  normalizeLibraryNavigation,
  type NavigationLibrary,
} from "../model/navigation";
import LibraryActionsMenu from "./LibraryActionsMenu";
import { LibraryIcon } from "./LibraryIcon";

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
  const [menuLibrary, setMenuLibrary] = useState<NavigationLibrary | null>(
    null,
  );
  const navigation = useMemo(
    () =>
      normalizeLibraryNavigation(
        (libraries || []).filter((library) =>
          isBrowsableLibraryType(library.type),
        ),
        settings,
      ),
    [libraries, settings],
  );
  const openMenu = (anchor: HTMLElement, library: NavigationLibrary) => {
    setMenuAnchor(anchor);
    setMenuLibrary(library);
  };
  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuLibrary(null);
  };
  const props = {
    loaded: Boolean(libraries),
    pathname: location.pathname,
    pinned: navigation.pinned,
    unpinned: navigation.unpinned,
    onMenu: openMenu,
  };
  return (
    <>
      <LibraryActionsMenu
        anchorEl={menuAnchor}
        library={menuLibrary}
        libraries={navigation.ordered}
        onClose={closeMenu}
        onNavigate={onNavigate}
      />
      {variant === "desktop" ? (
        <DesktopLibraries
          {...props}
          iconsOnly={navigation.preference.iconsOnly}
        />
      ) : (
        <MobileLibraries {...props} onNavigate={onNavigate} />
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

function DesktopLibraries({
  loaded,
  pathname,
  pinned,
  unpinned,
  onMenu,
  iconsOnly = false,
}: NavigationProps & { iconsOnly?: boolean }) {
  const decide = useCallback(
    (measurements: ToolbarMeasurements) =>
      libraryNavigationOverflow(
        measurements,
        pinned.map((library) => library.key),
        unpinned.length > 0,
      ),
    [pinned, unpinned.length],
  );
  const { toolbarRef, overflow } = useToolbarOverflow(decide);
  const hiddenPinned = pinned.filter((library) =>
    overflow.includes(library.key),
  );
  return (
    <Box
      ref={toolbarRef}
      role="navigation"
      aria-label="Libraries"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        height: "100%",
        flex: 1,
        minWidth: 0,
        position: "relative",
        overflow: "clip",
      }}
    >
      {!loaded && <CircularProgress size={20} />}
      {pinned.map((library) => (
        <LibraryLink
          key={library.key}
          library={library}
          active={isLibraryRouteActive(pathname, library.key)}
          onMenu={onMenu}
          iconsOnly={iconsOnly}
          hidden={overflow.includes(library.key)}
        />
      ))}
      {loaded && (
        <LibrariesDropdown
          pinned={hiddenPinned}
          unpinned={unpinned}
          pathname={pathname}
          onMenu={onMenu}
        />
      )}
    </Box>
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
        <LibraryListItem
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
          <Typography
            variant="overline"
            sx={{ color: "text.secondary", px: 2 }}
          >
            More
          </Typography>
          {unpinned.map((library) => (
            <LibraryListItem
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

function LibraryListItem({
  library,
  active,
  onMenu,
  onNavigate,
  autoFocus = false,
}: {
  library: NavigationLibrary;
  active: boolean;
  onMenu: NavigationProps["onMenu"];
  onNavigate?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <ListItem
      disablePadding
      secondaryAction={
        <IconButton
          edge="end"
          onClick={(event) => onMenu(event.currentTarget, library)}
          aria-label={"Actions for " + library.title}
          sx={menuDotsSx}
        >
          <MoreVertRounded />
        </IconButton>
      }
    >
      <ListItemButton
        component={Link}
        to={"/browse/" + library.key}
        selected={active}
        aria-current={active ? "page" : undefined}
        autoFocus={autoFocus}
        sx={{ pr: 7, minHeight: 48 }}
        onClick={onNavigate}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          <LibraryIcon type={library.type} />
        </ListItemIcon>
        <ListItemText
          primary={library.title}
          slotProps={{ primary: { sx: { overflowWrap: "anywhere" } } }}
        />
      </ListItemButton>
    </ListItem>
  );
}

function LibrariesDropdown({
  pinned,
  unpinned,
  pathname,
  onMenu,
}: {
  pinned: NavigationLibrary[];
  unpinned: NavigationLibrary[];
  pathname: string;
  onMenu: NavigationProps["onMenu"];
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = useId();
  const libraries = [...pinned, ...unpinned];
  const hidden = libraries.length === 0;
  useEffect(() => {
    if (hidden) setAnchor(null);
  }, [hidden]);
  const active = libraries.some((library) =>
    isLibraryRouteActive(pathname, library.key),
  );
  return (
    <Box
      data-overflow-item="more"
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      sx={{
        display: "inline-flex",
        flexShrink: 0,
        ...(hidden && { position: "absolute", visibility: "hidden" }),
      }}
    >
      <Tooltip title="More libraries">
        <Button
          variant="outlined"
          color="inherit"
          aria-label={"More libraries (" + libraries.length + ")"}
          aria-haspopup="dialog"
          aria-expanded={!hidden && Boolean(anchor)}
          aria-controls={!hidden && anchor ? id : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{
            height: 36,
            minWidth: 0,
            px: 1,
            gap: 0.25,
            whiteSpace: "nowrap",
            borderColor: active ? "primary.main" : "divider",
            color: active ? "primary.light" : "text.primary",
          }}
        >
          <AppsRounded fontSize="small" />
          <Box
            component="span"
            sx={{ minWidth: 20, fontVariantNumeric: "tabular-nums" }}
          >
            {libraries.length}
          </Box>
          <ArrowDropDownRounded fontSize="small" />
        </Button>
      </Tooltip>
      <Popover
        container={overlayContainer}
        anchorEl={anchor}
        open={!hidden && Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            id,
            role: "dialog",
            "aria-label": "More libraries",
            sx: {
              mt: 1,
              width: "min(360px, calc(100vw - 32px))",
              maxHeight: "min(480px, calc(100dvh - 96px))",
            },
          },
        }}
      >
        <List aria-label="Other libraries" dense>
          {libraries.map((library, index) => (
            <Fragment key={library.key}>
              {index === pinned.length && unpinned.length > 0 && (
                <>
                  {pinned.length > 0 && <Divider sx={{ my: 1 }} />}
                  <Typography
                    variant="overline"
                    sx={{ color: "text.secondary", px: 2 }}
                  >
                    Unpinned
                  </Typography>
                </>
              )}
              <LibraryListItem
                library={library}
                active={isLibraryRouteActive(pathname, library.key)}
                autoFocus={index === 0}
                onNavigate={() => setAnchor(null)}
                onMenu={(_element, selected) => {
                  if (anchor) onMenu(anchor, selected);
                  setAnchor(null);
                }}
              />
            </Fragment>
          ))}
        </List>
      </Popover>
    </Box>
  );
}

function LibraryLink({
  library,
  active,
  onMenu,
  hidden,
  iconsOnly,
}: {
  library: NavigationLibrary;
  active: boolean;
  onMenu: NavigationProps["onMenu"];
  hidden: boolean;
  iconsOnly: boolean;
}) {
  return (
    <Box
      data-overflow-item={library.key}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.25,
        flexShrink: 0,
        width: "max-content",
        ...(hidden && { position: "absolute", visibility: "hidden" }),
      }}
    >
      <Tooltip title={library.title}>
        <Box
          component={Link}
          to={"/browse/" + library.key}
          aria-label={"Open " + library.title}
          aria-current={active ? "page" : undefined}
          className={"head-link" + (active ? " head-link-active" : "")}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            py: 1,
            minWidth: 0,
            position: "relative",
            "&::after": { position: "absolute", bottom: 0, left: 0 },
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: 2,
            },
          }}
        >
          <LibraryIcon type={library.type} />
          {!iconsOnly && (
            <Typography
              component="span"
              noWrap
              sx={{ maxWidth: 180, font: "inherit" }}
            >
              {library.title}
            </Typography>
          )}
        </Box>
      </Tooltip>
      <IconButton
        size="small"
        onClick={(event) => onMenu(event.currentTarget, library)}
        aria-label={"Actions for " + library.title}
        sx={{ ...menuDotsSx, width: 24, height: 24, p: 0 }}
      >
        <MoreVertRounded fontSize="small" />
      </IconButton>
    </Box>
  );
}
