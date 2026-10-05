import { useEffect, useState } from "react";
import { mediaMetadataQueryOptions } from "./mediaMetadataQuery";
import { mediaExtrasQueryOptions } from "./mediaExtrasQuery";
import { useActiveServerScope } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { mergeTitleExtras, selectPrimaryTrailer } from "./mediaExtras";
import type { TitleExtra } from "./mediaExtras";
import type { MediaItemData } from "./media";

export function useMediaPreview(item: MediaItemData, enabled: boolean, remote = false) {
  const scope = useActiveServerScope();
  const [extra, setExtra] = useState<TitleExtra | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    setExtra(null);
    setVisible(false);
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const metadata = remote
          ? null
          : await serverQueryClient.fetchQuery(mediaMetadataQueryOptions(scope, item.ratingKey));
        if (!active || (!remote && !metadata)) return;
        const local = mergeTitleExtras(metadata?.Extras?.Metadata);
        const localTrailer = selectPrimaryTrailer(local, metadata?.primaryExtraKey);
        if (localTrailer) {
          setExtra(localTrailer);
          return;
        }
        const discover = await serverQueryClient
          .fetchQuery(mediaExtrasQueryOptions(scope.profileKey, metadata ?? item))
          .catch(() => []);
        if (active)
          setExtra(selectPrimaryTrailer(mergeTitleExtras([], discover), metadata?.primaryExtraKey));
      })().catch(() => undefined);
    }, 1000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [item, enabled, remote, scope]);
  const stop = () => {
    setExtra(null);
    setVisible(false);
  };
  return { extra, visible, onPlaying: () => setVisible(true), stop };
}
