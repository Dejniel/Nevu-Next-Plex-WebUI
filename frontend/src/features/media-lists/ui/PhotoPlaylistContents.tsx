import { useSearchParams } from "react-router-dom";
import { PhotoGalleryView, PhotoViewer } from "features/photos/public";
import { photoItems, photoViewerRange } from "features/photos/model";
import type { useVirtualGrid } from "shared/lib/useVirtualGrid";
import { useMediaList, type useMediaListWindow } from "../model/useMediaList";
import { playlistPhoto, type MediaListRecord } from "../model/mediaLists";
import type { PlaylistAction } from "./PlaylistEditor";
import { renderPlaylistEntryMenuItems } from "./PlaylistEntryMenuItems";
import PlaylistEntryCard from "./PlaylistEntryCard";

type AlbumWindow = ReturnType<typeof useMediaListWindow>;
type AlbumRange = ReturnType<typeof useMediaList>;

function entryMenu(
  record: MediaListRecord | undefined,
  editable: boolean,
  onEdit: (action: PlaylistAction) => void,
  close: () => void,
) {
  return editable && record?.kind === "media" && record.playlistItemID
    ? renderPlaylistEntryMenuItems(record, onEdit, close)
    : null;
}

/** Album actions and paging stay with lists; photo presentation is shared with libraries. */
export function PhotoPlaylistContents({
  list,
  data,
  grid,
  information,
  onInformationChange,
  onEdit,
}: {
  list: AlbumWindow;
  data: AlbumRange;
  grid: ReturnType<typeof useVirtualGrid>;
  information: boolean;
  onInformationChange: (value: boolean) => void;
  onEdit: (action: PlaylistAction) => void;
}) {
  const [params] = useSearchParams();
  const editable = data.summary?.smart === false;
  return (
    <>
      <PhotoGalleryView
        grid={grid}
        range={data}
        hasData={data.hasData}
        information={information}
        onInformationChange={onInformationChange}
        itemKey={(record) =>
          record.kind === "media"
            ? `${record.position}:${record.playlistItemID ?? record.item.ratingKey}`
            : record.id
        }
        getItem={playlistPhoto}
        renderUnavailable={(record, imageSizes) =>
          record.kind === "media" && (
            <PlaylistEntryCard
              entry={record}
              layout="square"
              imageSizes={imageSizes}
              editable={editable}
              onEdit={onEdit}
            />
          )
        }
        renderMenuItems={(record, close) =>
          entryMenu(record, editable, onEdit, close)
        }
      />
      {params.has("photo") && (
        <PhotoPlaylistViewer list={list} editable={editable} onEdit={onEdit} />
      )}
    </>
  );
}

function PhotoPlaylistViewer({
  list,
  editable,
  onEdit,
}: {
  list: AlbumWindow;
  editable: boolean;
  onEdit: (action: PlaylistAction) => void;
}) {
  const [params] = useSearchParams();
  const range = useMediaList(list, photoViewerRange(params));
  return (
    <PhotoViewer
      range={{ ...range, items: photoItems(range.items, playlistPhoto) }}
      renderMenuItems={(position, close) =>
        entryMenu(range.items.get(position), editable, onEdit, close)
      }
    />
  );
}
