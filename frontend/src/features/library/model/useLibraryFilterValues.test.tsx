import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryObserver } from "@tanstack/react-query";
import { useActiveServerScope } from "features/session/model";
import { serverQueryClient as client } from "shared/api/queryClient";
import { getLibraryDirectory } from "../api/libraryDirectories";
import { applyLibraryDirectoryChanges, libraryDirectoryQueryOptions } from "./libraryDirectories";
import useLibraryFilterValues from "./useLibraryFilterValues";

vi.mock("../api/libraryDirectories", () => ({ getLibraryDirectory: vi.fn() }));
vi.mock("features/session/model", async (original) => ({
  ...(await original<typeof import("features/session/model")>()), useActiveServerScope: vi.fn(),
}));
const scope = { serverId: "server", profileKey: "owner" };
const source: Plex.Filter = { key: "/library/sections/1/genre", filter: "genre", filterType: "string", title: "Genre", type: "filter" };
const response = (title = "Action") => ({ Metadata: [], Directory: [{ key: "1", title, fastKey: "/all?genre=393&movie.genre=394" }] } as unknown as Plex.MediaContainer);
const request = vi.mocked(getLibraryDirectory);
let root: Root;
const results = new Map<string, ReturnType<typeof useLibraryFilterValues>>();
function Harness({ value = source, name = "main", enabled = true }: { value?: Plex.Filter; name?: string; enabled?: boolean }) {
  const result = useLibraryFilterValues(value, enabled);
  results.set(name, result);
  return <div>{result.options.map((option) => option.label).join(",")}</div>;
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
  results.clear();
  vi.mocked(useActiveServerScope).mockReturnValue(scope);
  request.mockReset().mockResolvedValue(response());
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
});

it("shares the raw directory with other consumers, selects per-filter values, and aborts only after the last observer leaves", async () => {
  request.mockImplementation((_dir, _props, signal) => new Promise((_resolve, reject) => {
    signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
  }));
  const close = new QueryObserver(client, libraryDirectoryQueryOptions(scope, source.key)).subscribe(() => {});
  try {
    await render(<><Harness /><Harness name="other" /></>);
    expect(request).toHaveBeenCalledTimes(1);
    const signal = request.mock.calls[0][2]!;
    await render(null);
    expect(signal.aborted).toBe(false);
    close();
    expect(signal.aborted).toBe(true);
  } finally { close(); }
  request.mockResolvedValue(response());
  await render(<><Harness /><Harness name="qualified" value={{ ...source, filter: "movie.genre" }} /></>);
  expect(results.get("main")!.options).toEqual([{ value: "393", label: "Action" }]);
  expect(results.get("qualified")!.options).toEqual([{ value: "394", label: "Action" }]);
  expect(client.getQueryData(libraryDirectoryQueryOptions(scope, source.key).queryKey)).toEqual(response());
});

it("reuses a fresh directory when the selector remounts and does not fetch while disabled", async () => {
  await render(<Harness enabled={false} />);
  expect(request).not.toHaveBeenCalled();
  await render(<Harness />);
  await render(null);
  await render(<Harness />);
  expect(request).toHaveBeenCalledTimes(1);
  expect(results.get("main")!.options).toEqual([{ value: "393", label: "Action" }]);
});

it("isolates profiles and servers without displaying the previous options", async () => {
  await render(<Harness />);
  request.mockResolvedValue(response("Guest genre"));
  vi.mocked(useActiveServerScope).mockReturnValue({ ...scope, profileKey: "guest" });
  await render(<Harness />);
  expect(results.get("main")!.options[0].label).toBe("Guest genre");
  vi.mocked(useActiveServerScope).mockReturnValue({ ...scope, serverId: "other" });
  request.mockResolvedValue(response("Other server genre"));
  await render(<Harness />);
  expect(results.get("main")!.options[0].label).toBe("Other server genre");
  expect(request).toHaveBeenCalledTimes(3);
});

it("retries a failed directory through Query and exposes its native error", async () => {
  request.mockRejectedValueOnce(new Error("Offline"));
  await render(<Harness />);
  expect(results.get("main")!.error).toBe(true);
  expect(results.get("main")!.loading).toBe(false);
  await act(async () => { await results.get("main")!.retry(); });
  await settle();
  expect(results.get("main")!.error).toBe(false);
  expect(results.get("main")!.options[0].label).toBe("Action");
});

it("updates options after a relevant Plex change without refetching for an unrelated field", async () => {
  await render(<Harness />);
  const change = { ...scope, sectionId: "1", kind: "item" as const, effect: "metadata" as const, id: "1" };
  await act(async () => { await applyLibraryDirectoryChanges(client, [{ change: { ...change, fields: ["summary"] } }]); });
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValue(response("New genre"));
  await act(async () => { await applyLibraryDirectoryChanges(client, [{ change: { ...change, fields: ["Genre"] } }]); });
  await settle();
  expect(request).toHaveBeenCalledTimes(2);
  expect(results.get("main")!.options[0].label).toBe("New genre");
});
