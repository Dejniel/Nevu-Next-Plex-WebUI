import {
  closeMediaActionDialog,
  openMediaWatchedDialog,
  type MediaActionSelection,
} from "features/media-actions/model";
import { type MediaMetadata, matchesMediaScope } from "entities/media/model";
import { capturePlexSession } from "features/session/model";
import { useEffect, useRef } from "react";
import { useItemSelection } from "shared/lib/useItemSelection";
import type { TitleEpisodesModel } from "./useTitleEpisodes";

/** Episodes own selection only. The shared media controller owns their writes. */
export function useEpisodeActions(browser: TitleEpisodesModel) {
  const selection = useItemSelection(browser.identity);
  const dialog = useRef<MediaActionSelection | null>(null);
  useEffect(
    () => () => {
      closeMediaActionDialog(dialog.current);
      dialog.current = null;
    },
    [browser.identity],
  );
  const selected = browser.episodes.filter((episode) =>
    selection.ids.has(episode.ratingKey),
  );
  return {
    selection,
    selectedCount: selected.length,
    allSelected:
      browser.episodes.length > 0 &&
      selected.length === browser.episodes.length,
    request(watched: boolean, episode?: MediaMetadata) {
      const session = capturePlexSession();
      if (
        !session.scope ||
        !session.isCurrent() ||
        session.revision !== browser.revision ||
        !matchesMediaScope(session.scope, browser.scope)
      )
        return;
      const items = episode ? [episode] : selected;
      const action: MediaActionSelection | null = openMediaWatchedDialog(
        items,
        watched,
        episode
          ? undefined
          : (ids) => {
              if (dialog.current !== action) return;
              if (ids.length) selection.retain(ids);
              else selection.clear();
            },
      );
      if (action) dialog.current = action;
    },
  };
}
