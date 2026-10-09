import {
  MoreVertRounded,
  RefreshRounded,
  StarOutlineRounded,
} from "@mui/icons-material";
import {
  CircularProgress,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  formatMediaRating,
  validMediaRating,
  type MediaItemData,
} from "entities/media/model";
import {
  useActiveServerScope,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { useRef, useState, type ReactNode } from "react";
import { overlayContainer } from "shared/lib/overlayContainer";
import {
  openMediaListDialog,
  renderMediaListMenuItems,
} from "features/media-lists/public";
import { getOriginalDownloads } from "../model/downloads";
import { getMediaActionCapabilities } from "../model/mediaActionCapabilities";
import { useLazyMediaMetadata } from "../model/useLazyMediaMetadata";
import MediaRatingButton from "./MediaRatingButton";
import { renderOriginalDownloadMenuItems } from "./OriginalDownloadMenuItems";

interface Props {
  item: MediaItemData;
  onOpen?: () => void;
  renderMenuItems?: (onClose: () => void) => ReactNode;
}

/** Shared personal actions; each media workflow supplies its own leading actions. */
export function MediaItemMenu(props: Props) {
  const { serverId } = useActiveServerScope();
  const revision = useAuthSession((state) => state.revision);
  return (
    <ItemMenu
      key={`${serverId}:${revision}:${props.item.ratingKey}`}
      {...props}
    />
  );
}

function ItemMenu({ item, onOpen, renderMenuItems }: Props) {
  const allowDownloads = useServerSession(
    (state) => state.server?.allowSync === true,
  );
  const capabilities = getMediaActionCapabilities(item, {
    localItem: true,
    canManageServer: false,
    allowDownloads,
  });
  const metadata = useLazyMediaMetadata(item);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const rating = useRef<{ open: (anchor: HTMLElement) => void }>(null);
  const data = metadata.data;
  const downloads = data
    ? getOriginalDownloads(data, capabilities.canDownload)
    : [];
  const close = () => setAnchor(null);
  const load = () => {
    void metadata.load().catch(() => undefined);
  };
  const userRating = data?.userRating;
  return (
    <>
      <IconButton
        aria-label={`Actions for ${item.title}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => {
          onOpen?.();
          setAnchor(event.currentTarget);
          if (capabilities.canRate || capabilities.canDownload) load();
        }}
      >
        <MoreVertRounded />
      </IconButton>
      <Menu
        container={overlayContainer}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        onKeyDown={(event) => {
          if (event.key.startsWith("Arrow")) event.stopPropagation();
        }}
      >
        {renderMenuItems?.(close)}
        {renderMenuItems &&
          (capabilities.canAddToPlaylist ||
            capabilities.canRate ||
            capabilities.canDownload) && <Divider />}
        {renderMediaListMenuItems({
          capabilities,
          playlistType: item.type === "photo" ? "photo" : undefined,
          onSelect: (kind) => {
            close();
            openMediaListDialog(kind, item);
          },
        })}
        {capabilities.canAddToPlaylist &&
          (capabilities.canRate || capabilities.canDownload) && <Divider />}
        {capabilities.canRate && (
          <MenuItem
            disabled={!data}
            onClick={() => {
              if (anchor) rating.current?.open(anchor);
              close();
            }}
          >
            <ListItemIcon>
              <StarOutlineRounded fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Rate"
              secondary={
                validMediaRating(userRating) && userRating > 0
                  ? `Your rating: ${formatMediaRating(userRating)}`
                  : undefined
              }
            />
          </MenuItem>
        )}
        {(capabilities.canRate || capabilities.canDownload) &&
          metadata.status === "loading" &&
          !data && (
            <MenuItem disabled>
              <ListItemIcon>
                <CircularProgress size={18} />
              </ListItemIcon>
              <ListItemText>Loading media details…</ListItemText>
            </MenuItem>
          )}
        {(capabilities.canRate || capabilities.canDownload) &&
          metadata.status === "failed" && (
            <MenuItem onClick={load}>
              <ListItemIcon>
                <RefreshRounded fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Retry media details"
                secondary="Plex could not load this item."
              />
            </MenuItem>
          )}
        {renderOriginalDownloadMenuItems({
          downloads,
          onClose: close,
          singleLabel: "Download original file",
        })}
      </Menu>
      {capabilities.canRate && data && (
        <MediaRatingButton
          hideButton
          item={data}
          menuRef={rating}
          onChanged={(userRating) => metadata.update({ ...data, userRating })}
        />
      )}
    </>
  );
}
