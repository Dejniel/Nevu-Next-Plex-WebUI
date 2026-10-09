import {
  CheckBoxOutlineBlankRounded,
  CheckBoxRounded,
  CheckCircleOutlineRounded,
  CheckCircleRounded,
  MoreVertRounded,
  PlayArrowRounded,
} from "@mui/icons-material";
import {
  Box,
  ButtonBase,
  Checkbox,
  Divider,
  IconButton,
  LinearProgress,
  ListItemIcon,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { getTranscodeImageURL, isMediaWatched } from "entities/media/model";
import { getMediaActionCapabilities } from "features/media-actions/public";
import {
  openMediaListDialog,
  renderMediaListMenuItems,
} from "features/media-lists/public";
import { useCanManageServer } from "features/session/public";
import { useState } from "react";
import { Link } from "react-router-dom";
import { durationInMinutes } from "shared/lib/duration";
import { mediaWatchTo } from "shared/lib/navigation";
import { overlayContainer } from "shared/lib/overlayContainer";
import { StretchedLink } from "shared/ui";

export default function EpisodeRow({
  item,
  selecting,
  selected,
  busy,
  onToggle,
  onStartSelection,
  onCancelSelection,
  onSetWatched,
}: {
  item: Plex.Metadata;
  selecting: boolean;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onStartSelection: () => void;
  onCancelSelection: () => void;
  onSetWatched: (watched: boolean) => void;
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );
  const canManageServer = useCanManageServer();
  const capabilities = getMediaActionCapabilities(item, {
    localItem: true,
    canManageServer,
    allowDownloads: false,
  });
  const close = () => setAnchor(null);
  const selectionLabel = `Select episode ${item.index}: ${item.title}`;
  return (
    <>
      <Menu
        container={overlayContainer}
        open={Boolean(anchor)}
        onClose={close}
        anchorReference="anchorPosition"
        anchorPosition={anchor ?? undefined}
      >
        <Typography noWrap sx={{ fontWeight: 700, px: 2, maxWidth: 280 }}>
          EP.{item.index}: {item.title}
        </Typography>
        <Divider />
        <MenuItem component={Link} to={mediaWatchTo(item)} onClick={close}>
          <ListItemIcon>
            <PlayArrowRounded fontSize="small" />
          </ListItemIcon>
          Play
        </MenuItem>
        {renderMediaListMenuItems({
          capabilities,
          onSelect: (kind) => {
            close();
            openMediaListDialog(kind, item);
          },
        })}
        <MenuItem
          disabled={busy}
          onClick={() => {
            close();
            if (selecting) onCancelSelection();
            else onStartSelection();
          }}
        >
          <ListItemIcon>
            {selecting ? (
              <CheckBoxRounded fontSize="small" />
            ) : (
              <CheckBoxOutlineBlankRounded fontSize="small" />
            )}
          </ListItemIcon>
          {selecting ? "Disable Selection" : "Enable Selection"}
        </MenuItem>
        {capabilities.canSetWatched &&
          [true, false].map((watched) => (
            <MenuItem
              key={String(watched)}
              disabled={busy}
              onClick={() => {
                close();
                onSetWatched(watched);
              }}
            >
              <ListItemIcon>
                {watched ? (
                  <CheckCircleRounded fontSize="small" />
                ) : (
                  <CheckCircleOutlineRounded fontSize="small" />
                )}
              </ListItemIcon>
              Mark as {watched ? "Watched" : "Unwatched"}
            </MenuItem>
          ))}
      </Menu>
      <Box
        role="listitem"
        onContextMenu={(event) => {
          event.preventDefault();
          setAnchor({ left: event.clientX, top: event.clientY });
        }}
        sx={{
          position: "relative",
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: 2,
          p: 1.5,
          mb: 1,
          borderRadius: "10px",
          userSelect: "none",
          bgcolor: selected ? "action.selected" : undefined,
          "&:hover": {
            bgcolor: "action.hover",
            "& .episode-play-icon": { opacity: 1 },
          },
        }}
      >
        {selecting ? (
          <ButtonBase
            disabled={busy}
            aria-label={selectionLabel}
            aria-pressed={selected}
            onClick={onToggle}
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              zIndex: 1,
              "&.Mui-focusVisible": {
                outline: "2px solid",
                outlineColor: "primary.main",
              },
            }}
          />
        ) : (
          <StretchedLink to={mediaWatchTo(item)} label={`Play ${item.title}`} />
        )}
        <Box
          sx={{
            minWidth: { xs: 30, sm: 40 },
            alignSelf: "center",
            position: "relative",
            zIndex: 2,
          }}
        >
          {selecting ? (
            <Checkbox
              checked={selected}
              disabled={busy}
              onChange={onToggle}
              slotProps={{ input: { "aria-label": `Select ${item.title}` } }}
            />
          ) : (
            <Typography
              sx={{
                fontSize: { xs: "1rem", sm: "1.25rem" },
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              {item.index}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            width: { xs: 120, sm: "20%" },
            flexShrink: 0,
            borderRadius: 1,
            aspectRatio: "16/9",
            backgroundImage: item.thumb
              ? `url(${getTranscodeImageURL(item.thumb, 380, 214)})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            bgcolor: "action.hover",
            overflow: "hidden",
            display: "flex",
            position: "relative",
            boxShadow: (theme) =>
              `0 4px 6px -1px ${alpha(theme.palette.common.black, 0.2)}`,
          }}
        >
          {!selecting && (
            <PlayArrowRounded
              className="episode-play-icon"
              sx={{
                color: "#fff",
                fontSize: "400%",
                m: "auto",
                opacity: 0,
                bgcolor: "#00000088",
                borderRadius: "50%",
                transition: "opacity 0.2s ease",
              }}
            />
          )}
          <IconButton
            aria-label={`More actions for ${item.title}`}
            aria-haspopup="menu"
            aria-expanded={Boolean(anchor)}
            size="small"
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              zIndex: 2,
              bgcolor: "rgba(18,25,39,0.8)",
              color: "#fff",
            }}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              setAnchor({ left: bounds.left, top: bounds.bottom });
            }}
          >
            <MoreVertRounded fontSize="small" />
          </IconButton>
          {Boolean(item.viewOffset || isMediaWatched(item)) && (
            <LinearProgress
              aria-label={`Watch progress for ${item.title}`}
              value={
                item.viewOffset && item.duration > 0
                  ? Math.min(100, (item.viewOffset / item.duration) * 100)
                  : 100
              }
              variant="determinate"
              sx={{
                position: "absolute",
                bottom: 0,
                width: "100%",
                height: 4,
                bgcolor: "rgba(0,0,0,0.5)",
              }}
            />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            noWrap
            sx={{ fontSize: { xs: "1rem", sm: "1.25rem" }, fontWeight: 700 }}
          >
            {item.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {durationInMinutes(item.duration)} Min
          </Typography>
          <Typography
            title={item.summary}
            sx={{
              color: "text.secondary",
              fontSize: { xs: "0.9rem", sm: "1rem" },
              mt: 1,
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: { xs: 2, sm: 3 },
              overflow: "hidden",
            }}
          >
            {item.summary}
          </Typography>
        </Box>
      </Box>
    </>
  );
}
