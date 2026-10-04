import type { To } from "react-router-dom";

export interface AppLocation {
  pathname: string;
  search: string;
  hash?: string;
}

interface NavigableMedia {
  ratingKey: string;
  type?: string;
  grandparentRatingKey?: string;
  guid?: string;
  viewOffset?: number;
}

export type MediaDetailsTab =
  | "overview"
  | "episodes"
  | "details"
  | "reviews"
  | "media";

export interface MediaDetailsOptions {
  exactItem?: boolean;
  tab?: MediaDetailsTab;
}

function withQuery(
  location: AppLocation,
  update: (params: URLSearchParams) => void
): To {
  const params = new URLSearchParams(location.search);
  update(params);
  const search = params.toString();

  return {
    pathname: location.pathname,
    search: search ? `?${search}` : "",
    hash: location.hash || "",
  };
}

export function mediaDetailsTo(
  location: AppLocation,
  item: NavigableMedia,
  plexTvSource = false,
  options: MediaDetailsOptions = {},
): To {
  return withQuery(location, (params) => {
    params.delete("bkey");
    params.delete("bprops");
    params.delete("mid");
    params.delete("pguid");
    params.delete("detailsTab");
    if (options.tab) params.set("detailsTab", options.tab);

    if (plexTvSource && item.guid) {
      params.set("pguid", item.guid);
      return;
    }

    const ratingKey =
      !options.exactItem && item.type === "episode" && item.grandparentRatingKey
        ? item.grandparentRatingKey
        : item.ratingKey;
    params.set("mid", ratingKey);
  });
}

export function libraryBrowseTo(
  location: AppLocation,
  key: string,
  props?: Record<string, unknown>
): To {
  return withQuery(location, (params) => {
    params.delete("mid");
    params.delete("pguid");
    params.delete("detailsTab");
    params.set("bkey", key);

    if (props && Object.keys(props).length > 0) {
      params.set("bprops", JSON.stringify(props));
    } else {
      params.delete("bprops");
    }
  });
}

export function mediaWatchTo(item: NavigableMedia): string {
  const time = item.viewOffset ? `?t=${item.viewOffset}` : "";
  return `/watch/${item.ratingKey}${time}`;
}

export function libraryViewTo(
  location: AppLocation,
  view: "recommendations" | "browse" | "watchlist"
): To {
  return withQuery(location, (params) => {
    params.set("view", view);
    params.delete("shelf");
  });
}

export function recommendationShelfTo(
  location: AppLocation,
  shelfId: string
): To {
  return withQuery(location, (params) => {
    params.set("view", "recommendations");
    params.set("shelf", shelfId);
  });
}
