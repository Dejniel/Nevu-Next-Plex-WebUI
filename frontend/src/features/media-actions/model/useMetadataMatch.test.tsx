import type { MediaMetadata } from "entities/media/model";
import { notifyManager } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { serverQueryClient } from "shared/api/queryClient";
import { PlexRequestError } from "shared/api/PlexClient";
import { createMetadataMatcher } from "../api/matching";
import { useMetadataMatch } from "./useMetadataMatch";
import type { MetadataMatchCandidate } from "./matching";

vi.mock("../api/matching", () => ({ createMetadataMatcher: vi.fn() }));
const item = {
  ratingKey: "42",
  title: "Film",
  type: "movie",
  guid: "plex://movie/current",
  year: 2026,
} as MediaMetadata;
const current = { guid: item.guid!, name: "Current" };
const candidate = { guid: "plex://movie/other", name: "Other" };
const source = {
  scope: { serverId: "local", profileKey: "owner" },
  revision: 1,
  agents: vi.fn(),
  search: vi.fn(),
  apply: vi.fn(),
  unmatch: vi.fn(),
};
let state: ReturnType<typeof useMetadataMatch>;
let root: Root;
let host: HTMLDivElement;
const onClose = vi.fn(),
  onSaved = vi.fn();
function Harness() {
  state = useMetadataMatch(item, onClose, onSaved);
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const settle = () =>
  act(async () => {
    await new Promise((done) => setTimeout(done, 10));
  });
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  serverQueryClient.clear();
  vi.mocked(createMetadataMatcher).mockReturnValue(source);
  source.agents.mockResolvedValue([
    { identifier: "tv.plex.agents.movie", name: "Plex Movie" },
  ]);
  source.search.mockResolvedValue([current, candidate]);
  source.apply.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  serverQueryClient.clear();
  vi.unstubAllGlobals();
});
async function open() {
  await act(async () => root.render(<Harness />));
  await settle();
}

it("automatically searches the original criteria and selects a different match", async () => {
  await open();
  expect(source.search).toHaveBeenCalledWith(
    { title: "Film", year: 2026, language: "", agent: "" },
    expect.any(AbortSignal),
  );
  expect(state.selected).toEqual(candidate);
  expect(state.canApply).toBe(true);
  await act(async () => state.select(current.guid));
  expect(state.canApply).toBe(false);
});
it("submits new criteria only on Search and keeps the chosen provider", async () => {
  await open();
  await act(async () =>
    state.setCriteria({
      title: "imdb-tt1217209",
      agent: "tv.plex.agents.movie",
      language: "pl-PL",
    }),
  );
  expect(source.search).toHaveBeenCalledTimes(1);
  await act(async () => state.search());
  await settle();
  expect(source.search).toHaveBeenLastCalledWith(
    {
      title: "imdb-tt1217209",
      agent: "tv.plex.agents.movie",
      language: "pl-PL",
    },
    expect.any(AbortSignal),
  );
  await act(async () => state.setCriteria({ title: "imdb-invalid" }));
  await act(async () => state.search());
  expect(source.search).toHaveBeenCalledTimes(2);
  expect(state.errors.title).toBeTruthy();
});
it("retries a failed search using unchanged criteria rather than caching an empty success", async () => {
  source.search.mockRejectedValueOnce(new PlexRequestError(503, "offline"));
  await open();
  expect(state.error).toContain("503");
  expect(state.canApply).toBe(false);
  await act(async () => state.search());
  await settle();
  expect(state.error).toBeNull();
  expect(state.selected).toEqual(candidate);
  expect(source.search).toHaveBeenCalledTimes(2);
});
it("retains library-default searching if agents fail and allows their retry", async () => {
  source.agents.mockRejectedValueOnce(new Error("offline"));
  await open();
  expect(state.agentsError).toBeTruthy();
  expect(state.canApply).toBe(true);
  await act(async () => state.retryAgents());
  await settle();
  expect(state.agentsError).toBeNull();
  expect(state.agents).toHaveLength(1);
});
it("cancels superseded searches and ignores their late results", async () => {
  const first = deferred<MetadataMatchCandidate[]>();
  source.search.mockReturnValueOnce(first.promise);
  await open();
  const oldSignal = source.search.mock.calls[0][1] as AbortSignal;
  await act(async () => state.setCriteria({ title: "Another" }));
  await act(async () => state.search());
  await settle();
  expect(oldSignal.aborted).toBe(true);
  await act(async () =>
    first.resolve([{ guid: "plex://movie/stale", name: "Stale" }]),
  );
  expect(state.candidates).toEqual([current, candidate]);
});
it("keeps the dialog open on a failed write and permits a retry", async () => {
  source.apply.mockRejectedValueOnce(new PlexRequestError(403, "denied"));
  await open();
  await act(async () => state.apply());
  await settle();
  expect(state.error).toContain("administrator");
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => state.apply());
  await settle();
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
it("allows only one outstanding write and closes after its acknowledgement", async () => {
  const write = deferred<void>();
  source.apply.mockReturnValueOnce(write.promise);
  await open();
  let pending!: Promise<void>;
  await act(async () => {
    pending = state.apply();
    void state.apply();
  });
  expect(source.apply).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => {
    write.resolve();
    await pending;
  });
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
it("aborts work on unmount and suppresses callbacks even if a write later succeeds", async () => {
  const write = deferred<void>();
  source.apply.mockReturnValueOnce(write.promise);
  await open();
  let pending!: Promise<void>;
  await act(async () => {
    pending = state.apply();
  });
  const abort = source.apply.mock.calls[0][1] as AbortSignal;
  await act(async () => root.render(null));
  expect(abort.aborted).toBe(true);
  await act(async () => {
    write.resolve();
    await pending;
  });
  expect(onSaved).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
it("cancels reads when the workflow is closed", async () => {
  const read = deferred<MetadataMatchCandidate[]>();
  source.search.mockReturnValueOnce(read.promise);
  await open();
  const abort = source.search.mock.calls[0][1] as AbortSignal;
  await act(async () => root.render(null));
  expect(abort.aborted).toBe(true);
  await act(async () => read.resolve([candidate]));
});
