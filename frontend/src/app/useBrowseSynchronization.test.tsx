import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  connectPlexServerEvents,
  mediaChangeFromServer,
  type PlexServerChange,
} from "features/session/model";
import { publishMediaChange } from "entities/media/model";
import { startBrowseSynchronization } from "./browseSynchronization";
import { useBrowseSynchronization } from "./useBrowseSynchronization";

let profile: string | null;
let serverId: string;
let revision: number;
vi.mock("features/settings/model", () => ({
  useUserSettings: Object.assign(
    (select: (state: { profileKey: string | null }) => unknown) => select({ profileKey: profile }),
    { getState: () => ({ profileKey: profile }) },
  ),
}));
vi.mock("features/session/model", () => ({
  AuthStorage: { getServerToken: () => "test-token" },
  connectPlexServerEvents: vi.fn(),
  useServerSession: Object.assign(
    (select: (state: unknown) => unknown) => select({ server: { machineIdentifier: serverId } }),
    { getState: () => ({ server: { machineIdentifier: serverId } }) },
  ),
  mediaChangeFromServer: vi.fn((_change, scope) => ({ ...scope, kind: "recovery" })),
}));
vi.mock("./browseSynchronization", () => ({ startBrowseSynchronization: vi.fn() }));
const connect = vi.mocked(connectPlexServerEvents);
const start = vi.mocked(startBrowseSynchronization);
const disconnect = vi.fn();
let root: Root;
function Harness() {
  useBrowseSynchronization(revision);
  return null;
}
const render = async () => {
  await act(async () => root.render(<Harness />));
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  profile = "owner:1";
  serverId = "server";
  revision = 0;
  connect.mockReturnValue(disconnect);
  start.mockImplementation(() => ({ enqueue: vi.fn(), dispose: vi.fn() }));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("sends translated SSE and confirmed local changes through the same synchronization batch", async () => {
  await render();
  const scope = { serverId, profileKey: profile };
  const batch = start.mock.results[0].value;
  const received = connect.mock.calls[0][1];
  received({ kind: "library", sectionId: "2" });
  expect(mediaChangeFromServer).toHaveBeenCalledWith({ kind: "library", sectionId: "2" }, scope);
  expect(batch.enqueue).toHaveBeenCalledWith({ ...scope, kind: "recovery" });
  publishMediaChange({
    ...scope,
    profileKey: "owner:1",
    kind: "list",
    listKind: "playlist",
    id: "8",
  });
  expect(batch.enqueue).toHaveBeenLastCalledWith({
    ...scope,
    kind: "list",
    listKind: "playlist",
    id: "8",
  });
});

it("disposes the old scope and rejects its late stream callbacks and local changes", async () => {
  await render();
  const old = connect.mock.calls[0][1] as (event: PlexServerChange) => void;
  const batch = start.mock.results[0].value;
  const isCurrent = start.mock.calls[0][1];
  expect(isCurrent()).toBe(true);
  profile = "owner:2";
  await render();
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(batch.dispose).toHaveBeenCalledTimes(1);
  expect(isCurrent()).toBe(false);
  vi.mocked(batch.enqueue).mockClear();
  old({ kind: "server", reason: "reconnect" });
  publishMediaChange({ serverId, profileKey: profile, kind: "recovery" });
  expect(batch.enqueue).not.toHaveBeenCalled();
  expect(start.mock.results[1].value.enqueue).toHaveBeenCalledWith({
    serverId,
    profileKey: profile,
    kind: "recovery",
  });
});

it("reconnects when the server or session revision changes", async () => {
  await render();
  serverId = "other-server";
  await render();
  revision++;
  await render();
  expect(start).toHaveBeenCalledTimes(3);
  expect(start.mock.calls[1][0]).toEqual({ serverId, profileKey: profile });
  expect(disconnect).toHaveBeenCalledTimes(2);
});

it("does not connect without an active profile", async () => {
  profile = null;
  await render();
  expect(connect).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
});
