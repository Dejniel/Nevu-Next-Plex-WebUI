import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager } from "@tanstack/react-query";
import {
  type MediaMetadata,
  getMediaMetadata,
  getMediaChildren,
  getMediaByGuid,
  mediaChildrenQueryOptions,
  mediaMetadataQueryOptions,
  applyMediaDetailsChanges,
} from "entities/media/model";
import { serverQueryClient as client } from "shared/api/queryClient";
import { useAuthSession } from "features/session/model";
import { useTitleDetailsData } from "./useTitleDetailsData";

vi.mock("entities/media/api/media", async (original) => ({
  ...(await original<typeof import("entities/media/api/media")>()),
  getMediaMetadata: vi.fn(),
  getMediaChildren: vi.fn(),
  getMediaByGuid: vi.fn(),
}));
let scope = { serverId: "server", profileKey: "owner" };
vi.mock("features/session/model", async (original) => ({
  ...(await original<typeof import("features/session/model")>()),
  useActiveServerScope: () => scope,
  getActiveServerScope: () => scope,
}));
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
const episode = (id: string) =>
  ({
    ratingKey: id,
    type: "episode",
    parentRatingKey: "s1",
    index: 1,
  }) as MediaMetadata;
const show = {
  ratingKey: "show",
  type: "show",
  Children: {
    Metadata: [
      { ratingKey: "s1", index: 1 },
      { ratingKey: "s2", index: 2 },
    ],
  },
} as MediaMetadata;
let root: Root;
let state: ReturnType<typeof useTitleDetailsData>;
function Harness({ id = "show", guid }: { id?: string | null; guid?: string }) {
  state = useTitleDetailsData(id ?? null, guid ?? null);
  return null;
}
const render = async (value: React.ReactNode) => {
  await act(async () => root.render(value));
};
beforeEach(() => {
  vi.resetAllMocks();
  client.clear();
  scope = { serverId: "server", profileKey: "owner" };
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  vi.mocked(getMediaMetadata).mockImplementation(async (id) =>
    id === "show" ? show : episode(id),
  );
  vi.mocked(getMediaChildren).mockImplementation(async (id) => [
    episode(id === "s1" ? "e1" : "e2"),
  ]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
});

it("reuses full metadata and cached episodes when returning to a season", async () => {
  await render(<Harness />);
  expect(state.episodeBrowser.seasonId).toBe("s1");
  expect(state.episodeBrowser.episodes?.[0].ratingKey).toBe("e1");
  await act(async () => state.episodeBrowser.selectSeason("s2"));
  expect(state.episodeBrowser.episodes?.[0].ratingKey).toBe("e2");
  await act(async () => state.episodeBrowser.selectSeason("s1"));
  expect(state.episodeBrowser.episodes?.[0].ratingKey).toBe("e1");
  expect(getMediaChildren).toHaveBeenCalledTimes(2);
  expect(vi.mocked(getMediaMetadata).mock.calls.map(([id]) => id)).toEqual([
    "show",
    "e1",
    "e2",
  ]);
});

it("shares a pending metadata read with another consumer", async () => {
  let finish!: (data: MediaMetadata) => void;
  vi.mocked(getMediaMetadata).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = client.fetchQuery(mediaMetadataQueryOptions(scope, "show"));
  await render(<Harness />);
  expect(getMediaMetadata).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(show);
    await pending;
  });
  expect(state.data).toEqual(show);
});

it("ignores an old season's response after a quick selection change", async () => {
  let finish!: (data: MediaMetadata[]) => void;
  vi.mocked(getMediaChildren).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render(<Harness />);
  const signal = vi.mocked(getMediaChildren).mock.calls[0][1]!;
  await act(async () => state.episodeBrowser.selectSeason("s2"));
  expect(signal.aborted).toBe(true);
  await act(async () => finish([episode("old")]));
  expect(state.episodeBrowser.episodes?.[0].ratingKey).toBe("e2");
});

it("updates watched episodes from the confirmed canonical response without refetching the season", async () => {
  await render(<Harness />);
  const updated = { ...episode("e1"), viewCount: 1 };
  await act(async () =>
    applyMediaDetailsChanges(client, [
      {
        change: { ...scope, kind: "item", effect: "unknown", id: "e1" },
        update: {
          sectionId: "1",
          parentIds: ["s1", "show"],
          item: { ...updated, guid: updated.guid ?? "", type: "episode" },
          metadata: updated,
        },
      },
    ]),
  );
  expect(state.episodeBrowser.episodes?.[0].viewCount).toBe(1);
  expect(getMediaChildren).toHaveBeenCalledTimes(1);
});

it("reloads the affected season after episode insertion and leaves other seasons cached", async () => {
  await render(<Harness />);
  const other = mediaChildrenQueryOptions(scope, "unrelated");
  client.setQueryData(other.queryKey, [episode("other")]);
  vi.mocked(getMediaChildren).mockResolvedValue([episode("e1"), episode("e3")]);
  await act(async () =>
    applyMediaDetailsChanges(client, [
      {
        change: { ...scope, kind: "item", effect: "membership", id: "e3" },
        update: {
          sectionId: "1",
          parentIds: ["s1", "show"],
          item: { ...episode("e3"), guid: "episode/e3", type: "episode" },
        },
      },
    ]),
  );
  expect(state.episodeBrowser.episodes).toHaveLength(2);
  expect(client.getQueryState(other.queryKey)?.isInvalidated).toBe(false);
});

it("does not expose data or accept delayed edits from a previous profile", async () => {
  await render(<Harness />);
  const old = state;
  scope = { ...scope, profileKey: "guest" };
  vi.mocked(getMediaMetadata).mockResolvedValue({
    ratingKey: "show",
    type: "movie",
    title: "Guest",
  } as MediaMetadata);
  await render(<Harness />);
  await act(async () => old.setData({ ...show, title: "Old edit" }));
  expect(state.data?.title).toBe("Guest");
});

it("rejects delayed edits after a new session with the same profile", async () => {
  await render(<Harness />);
  const old = state;
  await act(async () => {
    client.clear();
    useAuthSession.setState({
      revision: useAuthSession.getState().revision + 1,
    });
  });
  await act(async () => old.setData({ ...show, title: "Old edit" }));
  expect(state.data?.title).not.toBe("Old edit");
});

it("resolves a cloud GUID through a scoped cancellable query", async () => {
  vi.mocked(getMediaByGuid).mockResolvedValue({
    ratingKey: "local",
  } as MediaMetadata);
  await render(<Harness id={null} guid="plex://movie/one" />);
  expect(state.resolvedRatingKey).toBe("local");
  expect(getMediaByGuid).toHaveBeenCalledWith(
    "plex://movie/one",
    expect.any(AbortSignal),
  );
});

it("falls back to an available season when the selected season is removed", async () => {
  await render(<Harness />);
  await act(async () => state.episodeBrowser.selectSeason("s2"));
  expect(state.episodeBrowser.seasonId).toBe("s2");
  await act(async () =>
    state.setData({
      ...show,
      Children: {
        ...show.Children!,
        Metadata: show.Children!.Metadata!.slice(0, 1),
      },
    }),
  );
  expect(state.episodeBrowser.seasonId).toBe("s1");
  expect(state.episodeBrowser.episodes[0].ratingKey).toBe("e1");
});

it("does not navigate away from the current season when on-deck changes in the background", async () => {
  await render(<Harness />);
  await act(async () =>
    state.setData({
      ...show,
      OnDeck: { Metadata: { parentIndex: 2 } },
    } as MediaMetadata),
  );
  expect(state.episodeBrowser.seasonId).toBe("s1");
  expect(getMediaChildren).toHaveBeenCalledTimes(1);
});

it("reports an episode read failure and allows retry instead of showing an empty season", async () => {
  vi.mocked(getMediaChildren).mockRejectedValue(new Error("Plex offline"));
  await render(<Harness />);
  expect(state.episodeBrowser.error).toContain("Could not load episodes");
  expect(state.episodeBrowser.loading).toBe(false);
  vi.mocked(getMediaChildren).mockResolvedValue([episode("e1")]);
  await act(async () => state.episodeBrowser.retry());
  expect(state.episodeBrowser.error).toBeNull();
  expect(state.episodeBrowser.episodes[0].ratingKey).toBe("e1");
});

it("keeps cached title details visible when a background metadata refresh fails", async () => {
  await render(<Harness />);
  vi.mocked(getMediaMetadata).mockRejectedValue(new Error("Plex offline"));
  await act(async () => {
    await client.invalidateQueries({
      queryKey: mediaMetadataQueryOptions(scope, "show").queryKey,
      exact: true,
    });
  });
  expect(state.data).toEqual(show);
  expect(state.loadError).toBeNull();
  expect(state.loading).toBe(false);
});
