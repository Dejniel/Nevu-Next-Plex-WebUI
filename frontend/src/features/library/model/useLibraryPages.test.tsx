import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { focusManager } from "@tanstack/react-query";
import type { LibraryPageDto, LibraryPageRequest } from "@nevu/contracts";
import { useServerSession } from "features/session/model";
import { serverQueryClient as client } from "shared/api/queryClient";
import { getLibraryPage, LibraryPageError } from "../api/libraryPage";
import { useLibraryPages } from "./useLibraryPages";
import { libraryWindowKey } from "./libraryPages";
import { libraryPageQueryKey, type LibraryQuery } from "./libraryQuery";
import { applyLibraryChanges } from "./librarySync";

vi.mock("../api/libraryPage", async (original) => ({
  ...(await original<typeof import("../api/libraryPage")>()),
  getLibraryPage: vi.fn(),
}));
const fetch = vi.mocked(getLibraryPage);
const query: LibraryQuery = { profileKey: "owner", sectionId: 1, type: "movie", sort: "titleSort" };
const scope = { serverId: "server", profileKey: "owner" };
const response = (request: LibraryPageRequest, label = "old", total = 20_000): LibraryPageDto => ({
  offset: request.offset,
  totalSize: total,
  size: Math.min(64, Math.max(0, total - request.offset)),
  hasMore: request.offset + 64 < total,
  items: Array.from({ length: Math.min(64, Math.max(0, total - request.offset)) }, (_, index) => ({
    ratingKey: String(request.offset + index),
    guid: `plex://movie/${index}`,
    title: `${label} ${request.offset + index}`,
    type: "movie",
    librarySectionID: 1,
    updatedAt: 1,
  })),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function cancellable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    ),
  ]);
}
let root: Root;
let latest: ReturnType<typeof useLibraryPages>;
function Harness({
  start = 0,
  value = query,
  name = "main",
}: {
  start?: number;
  value?: LibraryQuery;
  name?: string;
}) {
  const result = useLibraryPages(value, {
    start,
    end: start + 20,
    visibleStart: start,
    visibleEnd: start + 20,
  });
  if (name === "main") latest = result;
  return (
    <div>
      {result.items.get(start)?.title} {result.errors.get(0)?.message}
    </div>
  );
}
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
};
const render = async (element: React.ReactNode) => {
  await act(async () => root.render(element));
  await settle();
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  client.clear();
  client.mount();
  focusManager.setFocused(true);
  fetch.mockReset().mockImplementation(async (request) => response(request));
  useServerSession.setState({ server: { machineIdentifier: "server" } as Plex.ServerPreferences });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  client.unmount();
  focusManager.setFocused(undefined);
});

it("stores real pages, jumps without intermediate reads and reuses a cached return", async () => {
  await render(<Harness />);
  await render(<Harness start={10_000} />);
  expect(fetch.mock.calls.map(([request]) => request.offset)).toEqual([0, 9984]);
  const revision = client.getQueryData<{ revision: number }>(
    libraryWindowKey("server", query),
  )!.revision;
  expect(client.getQueryData(libraryPageQueryKey("server", query, revision, 9984))).toEqual(
    response({ ...query, offset: 9984, size: 64 }),
  );
  await render(<Harness />);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(latest.items.get(0)?.title).toBe("old 0");
});

it("shares a request across consumers and cancels only when the last one leaves", async () => {
  const pending = deferred<LibraryPageDto>();
  fetch.mockImplementation((_request, signal) => cancellable(pending.promise, signal!));
  await render(
    <>
      <Harness key="main" />
      <Harness key="other" name="other" />
    </>,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  const signal = fetch.mock.calls[0][1]!;
  await render(<Harness key="other" name="other" />);
  expect(signal.aborted).toBe(false);
  await render(null);
  expect(signal.aborted).toBe(true);
  pending.resolve(response({ ...query, offset: 0, size: 64 }));
  await settle();
});

it("keeps the old visible window after refresh failure and publishes a successful retry together", async () => {
  await render(<Harness start={64} />);
  const pending = deferred<LibraryPageDto>();
  fetch.mockImplementation((request) =>
    request.offset
      ? cancellable(pending.promise, fetch.mock.calls.at(-1)![1]!)
      : Promise.resolve(response(request, "new")),
  );
  let refresh!: ReturnType<typeof latest.refresh>;
  await act(async () => {
    refresh = latest.refresh();
  });
  await settle();
  expect(latest.items.get(64)?.title).toBe("old 64");
  expect(latest.items.get(0)?.title).toBe("old 0");
  pending.reject(new LibraryPageError("Refresh failed", true));
  await act(async () => {
    await refresh;
  });
  await settle();
  expect(latest.items.get(64)?.title).toBe("old 64");
  expect(latest.errors.get(0)?.message).toBe("Refresh failed");
  fetch.mockImplementation(async (request) => response(request, "new"));
  await act(async () => {
    await latest.retry(0);
  });
  await settle();
  expect(latest.items.get(0)?.title).toBe("new 0");
  expect(latest.items.get(64)?.title).toBe("new 64");
});

it("prepares the union of simultaneous consumers and includes scrolling during refresh", async () => {
  await render(
    <>
      <Harness />
      <Harness start={128} name="other" />
    </>,
  );
  const pending = deferred<LibraryPageDto>();
  fetch.mockImplementation((request) =>
    request.offset === 0 ? pending.promise : Promise.resolve(response(request, "new")),
  );
  let refresh!: ReturnType<typeof latest.refresh>;
  await act(async () => {
    refresh = latest.refresh();
  });
  await render(
    <>
      <Harness start={64} />
      <Harness start={128} name="other" />
    </>,
  );
  pending.resolve(response({ ...query, offset: 0, size: 64 }, "new"));
  await act(async () => {
    await refresh;
  });
  await settle();
  expect(
    fetch.mock.calls
      .slice(2)
      .map(([request]) => request.offset)
      .sort((a, b) => a - b),
  ).toEqual([0, 64, 128]);
  expect(latest.items.get(64)?.title).toBe("new 64");
});

it("patches safe metadata in active and inactive pages without a page read", async () => {
  await render(<Harness />);
  await render(<Harness start={128} />);
  const before = client
    .getQueriesData<LibraryPageDto>({ queryKey: ["library", "server", "owner"] })
    .flatMap(([, data]) => data?.items ?? [])
    .find((item) => item.ratingKey === "0")!;
  const calls = fetch.mock.calls.length;
  await act(async () =>
    applyLibraryChanges(client, [
      {
        change: { ...scope, kind: "item", effect: "unknown", id: "0", sectionId: "1" },
        update: { item: { ...before, thumb: "new-poster", updatedAt: 2 }, sectionId: "1" },
      },
    ]),
  );
  await render(<Harness />);
  expect(latest.items.get(0)?.thumb).toBe("new-poster");
  expect(fetch).toHaveBeenCalledTimes(calls);
});

it("refreshes structural changes once per result and never reads an unrelated library", async () => {
  await render(
    <>
      <Harness />
      <Harness name="other" value={{ ...query, sectionId: 2 }} />
    </>,
  );
  fetch.mockImplementation(async (request) => response(request, "new"));
  const calls = fetch.mock.calls.length;
  await act(async () =>
    applyLibraryChanges(
      client,
      Array.from({ length: 20 }, (_, index) => ({
        change: {
          ...scope,
          kind: "item" as const,
          effect: "membership" as const,
          id: String(index),
          sectionId: "1",
        },
      })),
    ),
  );
  await settle();
  expect(fetch.mock.calls.slice(calls).map(([request]) => request.sectionId)).toEqual([1]);
  expect(latest.items.get(0)?.title).toBe("new 0");
});

it("does not let a read started before a mutation overwrite its replacement", async () => {
  const old = deferred<LibraryPageDto>();
  fetch.mockImplementationOnce((_request, signal) => cancellable(old.promise, signal!));
  await render(<Harness />);
  fetch.mockImplementation(async (request) => response(request, "confirmed"));
  await act(async () =>
    applyLibraryChanges(client, [
      { change: { ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "0" } },
    ]),
  );
  old.resolve(response({ ...query, offset: 0, size: 64 }, "stale"));
  await settle();
  expect(latest.items.get(0)?.title).toBe("confirmed 0");
});

it("rejects mixed random generations and retains the published revision", async () => {
  await render(<Harness start={64} />);
  fetch.mockImplementation(async (request) => ({
    ...response(request, "new"),
    generationId: request.offset ? "b" : "a",
  }));
  await act(async () => {
    await latest.refresh();
  });
  await settle();
  expect(latest.items.get(64)?.title).toBe("old 64");
  expect(latest.errors.get(0)?.retryable).toBe(true);
});

it("retries a first-page error and discovers an unknown total at the final short page", async () => {
  fetch.mockRejectedValueOnce(new LibraryPageError("Unavailable", true));
  await render(<Harness />);
  expect(latest.errors.get(0)?.message).toBe("Unavailable");
  fetch.mockImplementation(async (request) => ({
    ...response(request, "tail", 70),
    totalSize: null,
  }));
  await act(async () => {
    await latest.retry(0);
  });
  await settle();
  await render(<Harness start={64} />);
  expect(latest.totalSize).toBe(70);
});

it("refreshes parent aggregates when an untyped result contains a changed episode", async () => {
  fetch.mockImplementation(async (request) => ({
    ...response(request),
    items: response(request).items.map((item) => ({
      ...item,
      type: "episode" as const,
      parentRatingKey: "parent",
    })),
  }));
  await render(<Harness value={{ ...query, type: undefined }} />);
  const before = latest.items.get(0)!;
  await act(async () =>
    applyLibraryChanges(client, [
      {
        change: { ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "0" },
        update: { item: { ...before, viewCount: 1 }, sectionId: "1", parentIds: ["parent"] },
      },
    ]),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("revalidates an opaque predicate even when the displayed projection is unchanged", async () => {
  await render(
    <Harness
      value={{
        ...query,
        filterExpression: { kind: "clause", field: "summary", operator: "=", value: "changed" },
      }}
    />,
  );
  const before = latest.items.get(0)!;
  await act(async () =>
    applyLibraryChanges(client, [
      {
        change: { ...scope, sectionId: "1", kind: "item", effect: "unknown", id: "0" },
        update: { item: before, sectionId: "1" },
      },
    ]),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});
