import type { MediaMetadata } from "entities/media/model";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import {
  getMediaActionCapabilities,
  MediaActionDialogHost,
} from "features/media-actions/public";
import { ProxiedRequest } from "shared/api/backend";
import { serverQueryClient as client } from "shared/api/queryClient";
import { titleReviewsQueryOptions } from "../model/titleReviewsQuery";
import TitlePrimaryActions from "./TitlePrimaryActions";

vi.mock("shared/api/backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("shared/api/backend")>()),
  ProxiedRequest: vi.fn(),
}));
vi.mock("features/watchlist/public", () => ({
  HeroWatchlistButton: () => null,
  WatchlistMenuItem: () => null,
}));
vi.mock("../model/useTitleActionOverflow", () => ({
  useTitleActionOverflow: () => ({
    toolbarRef: { current: null },
    overflow: [],
  }),
}));

it("retains movie review invalidation and immediate title feedback after sharing rating controls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client.clear();
  localStorage.clear();
  sessionStorage.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  useAuthSession.setState({
    status: "ready",
    revision: 1,
    ownerUser: { id: 1 } as Plex.UserData,
    activeProfile: {
      id: 1,
      title: "Owner",
      isOwner: true,
      protected: false,
      restricted: false,
    },
  });
  useServerSession.setState({
    server: { machineIdentifier: "server" } as Plex.ServerPreferences,
  });
  vi.mocked(ProxiedRequest).mockResolvedValue({ status: 200, data: null });
  const movie = {
    ratingKey: "12",
    guid: "plex://movie/movie-id",
    type: "movie",
    title: "Movie",
    userRating: 8,
  } as MediaMetadata;
  const key = titleReviewsQueryOptions("1:1", movie.guid).queryKey;
  const other = titleReviewsQueryOptions("1:2", movie.guid).queryKey;
  const reviews = {
    userReview: null,
    friendReviews: { nodes: [] },
    recentReviews: { nodes: [] },
    topReviews: { nodes: [] },
  };
  client.setQueryData(key, reviews);
  client.setQueryData(other, reviews);
  function Harness() {
    const [item, setItem] = useState<MediaMetadata | undefined>(movie);
    return (
      <TitlePrimaryActions
        data={item!}
        onDataChanged={setItem}
        capabilities={getMediaActionCapabilities(item!, {
          localItem: true,
          canManageServer: false,
          allowDownloads: false,
        })}
        onEditMetadata={() => {}}
        onMatch={() => {}}
      />
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <Harness />
        </MemoryRouter>,
      ),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Your rating: 8.0/10"]')!
        .click(),
    );
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Clear rating"]')!
        .click(),
    );
    const [path, method, headers, , signal] =
      vi.mocked(ProxiedRequest).mock.calls[0];
    const url = new URL(path, "http://plex");
    expect(url.pathname).toBe("/:/rate");
    expect(url.searchParams.get("key")).toBe("12");
    expect(url.searchParams.get("rating")).toBe("-1");
    expect(method).toBe("GET");
    expect(headers).toMatchObject({ "X-Plex-Token": "server" });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(host.querySelector('[aria-label="Rate this title"]')).toBeTruthy();
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
    vi.unstubAllGlobals();
  }
});

it("uses the shared watched confirmation and leaves watched metadata updates to synchronization", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "token",
  });
  useAuthSession.setState({
    status: "ready",
    revision: 1,
    ownerUser: { id: 1 } as Plex.UserData,
    activeUser: { id: 1, restricted: false } as Plex.UserData,
    activeProfile: {
      id: 1,
      title: "Owner",
      isOwner: true,
      protected: false,
      restricted: false,
    },
  });
  useServerSession.setState({
    server: { machineIdentifier: "server" } as Plex.ServerPreferences,
    canManageServer: false,
  });
  vi.mocked(ProxiedRequest).mockClear();
  vi.mocked(ProxiedRequest)
    .mockResolvedValueOnce({ status: 503, data: {} })
    .mockResolvedValue({ status: 200, data: {} });
  const changed = vi.fn();
  let movie = {
    ratingKey: "12",
    type: "movie",
    title: "Movie",
    viewCount: 0,
  } as MediaMetadata;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async () =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <TitlePrimaryActions
            data={movie}
            onDataChanged={changed}
            capabilities={getMediaActionCapabilities(movie, {
              localItem: true,
              canManageServer: false,
              allowDownloads: false,
            })}
            onEditMetadata={() => {}}
            onMatch={() => {}}
          />
          <MediaActionDialogHost />
        </MemoryRouter>,
      ),
    );
  const click = async (text: string) =>
    act(async () => {
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === text)!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  try {
    await render();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Mark as watched"]')!
        .click(),
    );
    await click("Confirm");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "HTTP 503",
    );
    expect(changed).not.toHaveBeenCalled();
    await click("Retry");
    expect(ProxiedRequest).toHaveBeenCalledTimes(2);
    expect(changed).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="Mark as watched"]')).not.toBeNull();
    movie = { ...movie, viewCount: 1 };
    await render();
    expect(
      host.querySelector('[aria-label="Mark as unwatched"]'),
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
    vi.unstubAllGlobals();
  }
});
