import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager } from "@tanstack/react-query";
import { fetchDiscoverExtras } from "entities/media/model";
import { serverQueryClient as client } from "shared/api/queryClient";
import { useTitleExtras } from "./useTitleExtras";
vi.mock("entities/media/api/mediaExtras", async (original) => ({
  ...(await original<typeof import("entities/media/api/mediaExtras")>()),
  fetchDiscoverExtras: vi.fn(),
}));
const scope = { serverId: "server", profileKey: "owner" };
vi.mock("features/session/model", async (original) => ({
  ...(await original<typeof import("features/session/model")>()),
  useActiveServerScope: () => scope,
}));
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() => notifyManager.setScheduler((callback) => setTimeout(callback, 0)));
let root: Root;
let item: Plex.Metadata;
let state: ReturnType<typeof useTitleExtras>;
function Harness() {
  state = useTitleExtras(item);
  return null;
}
beforeEach(() => {
  vi.resetAllMocks();
  client.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  item = { ratingKey: "1", guid: "plex://movie/5d776824f617c900201df022" } as Plex.Metadata;
  vi.mocked(fetchDiscoverExtras).mockResolvedValue([]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
});
it("shares Discover extras between hero and details and keeps the local trailer first", async () => {
  item = {
    ...item,
    Extras: { Metadata: [{ ratingKey: "local-trailer", extraType: 1, title: "Local trailer" }] },
  } as Plex.Metadata;
  vi.mocked(fetchDiscoverExtras).mockResolvedValue([
    { ratingKey: "cloud-trailer", extraType: 1, title: "Cloud trailer" },
  ] as Plex.Metadata[]);
  await act(async () =>
    root.render(
      <>
        <Harness />
        <Harness />
      </>,
    ),
  );
  expect(fetchDiscoverExtras).toHaveBeenCalledTimes(1);
  expect(state.extras).toHaveLength(2);
  expect(state.primaryTrailer?.source).toBe("local");
});
it("does not refetch extras for an unrelated metadata edit of the same title", async () => {
  await act(async () => root.render(<Harness />));
  item = { ...item, summary: "Edited" };
  await act(async () => root.render(<Harness />));
  expect(fetchDiscoverExtras).toHaveBeenCalledTimes(1);
});
it("cancels an old match's extras without exposing them after a GUID change", async () => {
  let finish!: (items: Plex.Metadata[]) => void;
  vi.mocked(fetchDiscoverExtras).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => root.render(<Harness />));
  const signal = vi.mocked(fetchDiscoverExtras).mock.calls[0][1]!;
  item = { ...item, guid: "plex://movie/5d776824f617c900201df023" };
  await act(async () => root.render(<Harness />));
  expect(signal.aborted).toBe(true);
  await act(async () => finish([{ ratingKey: "old-trailer", extraType: 1 }] as Plex.Metadata[]));
  expect(state.extras).toEqual([]);
});
it("keeps local extras usable after a failed Discover read", async () => {
  item = {
    ...item,
    Extras: { Metadata: [{ ratingKey: "local-trailer", extraType: 1 }] },
  } as Plex.Metadata;
  vi.mocked(fetchDiscoverExtras).mockRejectedValue(new Error("Unavailable"));
  await act(async () => root.render(<Harness />));
  expect(state.extras).toHaveLength(1);
  expect(state.loading).toBe(false);
});
