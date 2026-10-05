import { QueryObserver } from "@tanstack/react-query";
import { createQueryClient } from "shared/api/queryClient";
import { getLibraries } from "../api/libraries";
import { librariesQueryOptions } from "./libraries";

vi.mock("../api/libraries", () => ({ getLibraries: vi.fn() }));
const scope = { serverId: "server", profileKey: "owner" };
const client = createQueryClient();
afterEach(() => client.clear());

it("shares the library sections read and cancels it after session reset", async () => {
  let finish!: (libraries: Plex.LibarySection[]) => void;
  vi.mocked(getLibraries).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const options = librariesQueryOptions(scope);
  const load = client.fetchQuery(options).catch((error) => error);
  const second = client.fetchQuery(options).catch((error) => error);
  expect(getLibraries).toHaveBeenCalledTimes(1);
  const signal = vi.mocked(getLibraries).mock.calls[0][0]!;
  client.clear();
  expect(signal.aborted).toBe(true);
  finish([{ key: "1", title: "Old library" } as Plex.LibarySection]);
  await Promise.all([load, second]);
  expect(client.getQueryData(options.queryKey)).toBeUndefined();
});

it("keeps a different profile's sections separate and retains data after failed refresh", async () => {
  const libraries = [{ key: "1", title: "Movies" } as Plex.LibarySection];
  vi.mocked(getLibraries).mockResolvedValue(libraries);
  const options = librariesQueryOptions(scope);
  await client.fetchQuery(options);
  expect(
    client.getQueryData(librariesQueryOptions({ ...scope, profileKey: "guest" }).queryKey),
  ).toBeUndefined();
  vi.mocked(getLibraries).mockRejectedValue(new Error("Offline"));
  const observer = new QueryObserver(client, options);
  const close = observer.subscribe(() => {});
  await observer.refetch();
  expect(observer.getCurrentResult().data).toEqual(libraries);
  expect(observer.getCurrentResult().isError).toBe(true);
  close();
});
