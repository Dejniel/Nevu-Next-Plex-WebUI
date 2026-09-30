import { useEffect, useMemo, useState } from "react";
import { fetchDiscoverExtras } from "entities/media/model";
import {
  mergeTitleExtras,
  selectPrimaryTrailer,
  TitleExtra,
} from "entities/media/model";

export function useTitleExtras(item?: Plex.Metadata | null) {
  const [extras, setExtras] = useState<TitleExtra[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    if (!item) {
      setExtras([]);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const localExtras = item.Extras?.Metadata ?? [];
    setExtras(mergeTitleExtras(localExtras));
    setLoading(true);

    fetchDiscoverExtras(item)
      .catch(() => [])
      .then((discoverExtras) => {
        if (active) setExtras(mergeTitleExtras(localExtras, discoverExtras));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [item]);

  const primaryTrailer = useMemo(
    () => selectPrimaryTrailer(extras, item?.primaryExtraKey),
    [extras, item?.primaryExtraKey],
  );

  return { extras, loading, primaryTrailer };
}
