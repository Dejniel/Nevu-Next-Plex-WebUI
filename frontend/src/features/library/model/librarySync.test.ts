import { focusManager, QueryObserver } from "@tanstack/react-query";
import { createQueryClient } from "shared/api/queryClient";
import { invalidateRandomCatalogs, synchronizeLibraryItem } from "../api/libraryPage";
import { startLibrarySynchronization } from "./librarySync";
import { libraryWindowKey } from "./libraryPages";
import { mediaMetadataQueryKey } from "entities/media/model";

vi.mock("../api/libraryPage", () => ({
  invalidateRandomCatalogs: vi.fn(),
  synchronizeLibraryItem: vi.fn(),
}));
const scope = { serverId: "server", profileKey: "owner" };
const client = createQueryClient();
let close: () => void;
let sync: ReturnType<typeof startLibrarySynchronization>;
const refresh = vi.fn(async () => ({ revision: 1 }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  focusManager.setFocused(true);
  vi.mocked(invalidateRandomCatalogs).mockResolvedValue(undefined);
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({ item: null, sectionId: "1" });
  refresh.mockResolvedValue({ revision: 1 });
  close = new QueryObserver(client, {
    queryKey: libraryWindowKey("server", { profileKey: "owner", sectionId: 1, sort: "titleSort" }),
    queryFn: refresh,
    initialData: { revision: 0 },
    staleTime: Infinity,
  }).subscribe(() => {});
  sync = startLibrarySynchronization(scope, () => true, client);
});
afterEach(() => {
  sync.dispose();
  close();
  client.clear();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

it("limits an eight-second scan to three window refreshes including its final reconciliation", async () => {
  for (let index = 0; index < 80; index++) {
    sync.enqueue({
      ...scope,
      sectionId: "1",
      kind: "item",
      effect: "membership",
      id: String(index),
    });
    await vi.advanceTimersByTimeAsync(100);
  }
  await vi.advanceTimersByTimeAsync(5000);
  expect(refresh).toHaveBeenCalledTimes(3);
  expect(invalidateRandomCatalogs).toHaveBeenCalledTimes(3);
});

it("does not lose a notification received while a canonical read is pending", async () => {
  let finish!: (value: { item: null; sectionId: string }) => void;
  vi.mocked(synchronizeLibraryItem).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "1" });
  await vi.advanceTimersByTimeAsync(1000);
  sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "1" });
  finish({ item: null, sectionId: "1" });
  await vi.advanceTimersByTimeAsync(6000);
  expect(synchronizeLibraryItem).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("coalesces duplicate IDs and makes no hidden-tab requests before returning", async () => {
  focusManager.setFocused(false);
  for (let index = 0; index < 20; index++)
    sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "1" });
  await vi.advanceTimersByTimeAsync(20_000);
  expect(synchronizeLibraryItem).not.toHaveBeenCalled();
  focusManager.setFocused(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(synchronizeLibraryItem).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("ignores a different profile and discards unfinished work after disposal", async () => {
  sync.enqueue({ ...scope, profileKey: "other", kind: "recovery" });
  sync.enqueue({ ...scope, kind: "recovery" });
  sync.dispose();
  await vi.advanceTimersByTimeAsync(6000);
  expect(invalidateRandomCatalogs).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});

it("updates cached full metadata with the same canonical read and rejects its older pending response", async () => {
  const key = mediaMetadataQueryKey(scope, "1");
  const fresh = {
    ratingKey: "1",
    title: "Confirmed",
    summary: "Canonical details",
    librarySectionID: 1,
  };
  client.setQueryData(key, { ...fresh, title: "Old" });
  let finish!: (value: typeof fresh) => void;
  const read = vi.fn(
    () =>
      new Promise<typeof fresh>((resolve) => {
        finish = resolve;
      }),
  );
  const stop = new QueryObserver(client, { queryKey: key, queryFn: read, staleTime: 0 }).subscribe(
    () => {},
  );
  vi.mocked(synchronizeLibraryItem).mockResolvedValue({
    item: null,
    sectionId: "1",
    metadata: fresh,
  });
  try {
    sync.enqueue({ ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "1" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(synchronizeLibraryItem).toHaveBeenCalledWith("1", expect.any(AbortSignal), true);
    expect(client.getQueryData(key)).toEqual(fresh);
    finish({ ...fresh, title: "Stale response" });
    await vi.advanceTimersByTimeAsync(10);
    expect(client.getQueryData(key)).toEqual(fresh);
    expect(read).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});
