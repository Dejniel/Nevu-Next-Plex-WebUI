import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MusicProvider, useMusic } from "./MusicProvider";
import { serverQueryClient } from "shared/api/queryClient";
import type { MusicQueue } from "../api/music";
const mocks = vi.hoisted(() => ({
  scope: { serverId: "server", profileKey: "owner" },
  create: vi.fn(),
  get: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  move: vi.fn(),
}));
vi.mock("features/session/model", () => ({
  useActiveServerScope: () => mocks.scope,
  useAuthSession: () => 1,
  getXPlexProps: () => ({ "X-Plex-Token": mocks.scope.profileKey }),
}));
vi.mock("entities/library/model", () => ({
  useLibraries: () => ({ data: [{ key: "3", uuid: "library-uuid" }] }),
}));
vi.mock("../api/music", () => ({ musicAPI: () => mocks }));
vi.mock("entities/media/model", () => ({
  mediaMetadataQueryOptions: (scope: unknown, id: string) => ({
    queryKey: ["test-metadata", scope, id],
    queryFn: async () => ({ ratingKey: id, type: "track", title: id }),
  }),
}));
const track = (id: number, entry: number) =>
  ({
    ratingKey: String(id),
    type: "track",
    title: String(id),
    playQueueItemID: entry,
  }) as Plex.Metadata;
const queue: MusicQueue = {
  id: 10,
  version: 1,
  total: 3,
  selected: 100,
  selectedOffset: 0,
  items: [track(1, 100), track(1, 101), track(2, 102)],
};
let root: Root, host: HTMLDivElement, controller: ReturnType<typeof useMusic>;
function Probe() {
  controller = useMusic();
  return (
    <span>
      {controller.session?.entryID}:{controller.track?.ratingKey}
    </span>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.scope = { serverId: "server", profileKey: "owner" };
  mocks.create.mockReset();
  mocks.create.mockResolvedValue(queue);
  mocks.get.mockReset();
  mocks.get.mockResolvedValue(queue);
  serverQueryClient.clear();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  serverQueryClient.clear();
  vi.unstubAllGlobals();
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
it("plays duplicate queue entries separately and retains the track while browsing a different queue window", async () => {
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => controller.play(track(1, 100)));
  await settle();
  expect(controller.session?.entryID).toBe(100);
  await act(async () => controller.step(1));
  expect(controller.session?.entryID).toBe(101);
  mocks.get.mockResolvedValue({ ...queue, items: [track(2, 102)] });
  await act(async () => controller.loadWindow(102));
  expect(controller.track?.ratingKey).toBe("1");
  expect(controller.session?.entryID).toBe(101);
});
it("does not publish a late queue after a profile switch", async () => {
  let resolve!: (queue: MusicQueue) => void;
  mocks.create.mockReturnValue(
    new Promise<MusicQueue>((done) => {
      resolve = done;
    }),
  );
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = controller.play(track(1, 100));
  });
  mocks.scope = { serverId: "server", profileKey: "managed" };
  await act(async () =>
    root.render(
      <MusicProvider>
        <Probe />
      </MusicProvider>,
    ),
  );
  await act(async () => {
    resolve(queue);
    await pending;
  });
  expect(controller.session).toBeNull();
  expect(
    serverQueryClient.getQueryData(["music-queue", "server", "owner", 10]),
  ).toBeUndefined();
});
