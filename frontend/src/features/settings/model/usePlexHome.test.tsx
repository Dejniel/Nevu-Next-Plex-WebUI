import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AuthStorage,
  useAuthSession,
  changePlexHome,
  getPlexHomeOverview,
} from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import type { PlexHomeOverview } from "features/session/model";
import { usePlexHome } from "./usePlexHome";

vi.mock("features/session/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("features/session/model")>()),
  changePlexHome: vi.fn(),
  getPlexHomeOverview: vi.fn(),
}));
const read = vi.mocked(getPlexHomeOverview);
const write = vi.mocked(changePlexHome);
const owner = {
  id: 1,
  title: "Owner",
  protected: true,
  restricted: false,
  isOwner: true,
};
const child = {
  id: 2,
  title: "Child",
  protected: false,
  restricted: true,
  isOwner: false,
};
const overview: PlexHomeOverview = {
  members: [
    { ...owner, admin: true, guest: false, restrictionProfile: "unrestricted" },
    { ...child, admin: false, guest: false, restrictionProfile: "teen" },
  ],
  invites: [],
  canManage: true,
  canInvite: true,
  guestEnabled: false,
  maxSize: 15,
};
let root: Root;
let host: HTMLDivElement;
let state: ReturnType<typeof usePlexHome>;
function Harness() {
  state = usePlexHome();
  return null;
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  serverQueryClient.clear();
  localStorage.clear();
  sessionStorage.clear();
  AuthStorage.setOwnerToken("login-account-token");
  AuthStorage.saveActiveSession({
    profile: owner,
    accountToken: "active-account-token",
    serverToken: "server-token",
  });
  useAuthSession.setState({
    status: "ready",
    revision: 1,
    activeProfile: owner,
    ownerUser: { id: 1 } as Plex.UserData,
    activeUser: { id: 1, protected: true } as Plex.UserData,
  });
  read.mockResolvedValue(overview);
  write.mockResolvedValue();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
  await flush();
});
afterEach(async () => {
  await act(async () => root.unmount());
  serverQueryClient.clear();
  host.remove();
  vi.unstubAllGlobals();
});

it("loads Home using the active account rather than the stored login or server token", () => {
  expect(read).toHaveBeenCalledWith(
    { activeId: 1, token: "active-account-token" },
    expect.any(AbortSignal),
  );
  expect(
    serverQueryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey),
  ).toEqual([["plex-home", 1, 1]]);
});

it("re-reads Plex after a confirmed change and updates picker/storage without changing profile scope", async () => {
  const updated = {
    ...overview,
    members: overview.members.map((member) =>
      member.id === 1
        ? { ...member, title: "Renamed", protected: false }
        : member,
    ),
  };
  read.mockResolvedValueOnce(updated);
  await act(async () => {
    expect(
      await state.change({
        type: "pin",
        member: overview.members[0],
        pin: "",
        currentPin: "1234",
      }),
    ).toBe(true);
  });
  await flush();
  expect(read).toHaveBeenCalledTimes(2);
  expect(useAuthSession.getState()).toMatchObject({
    revision: 1,
    activeProfile: { title: "Renamed", protected: false },
    activeUser: { protected: false },
  });
  expect(AuthStorage.getActiveSession()).toMatchObject({
    profile: { title: "Renamed", protected: false },
  });
  expect(JSON.stringify(localStorage)).not.toContain("1234");
  expect(serverQueryClient.getMutationCache().getAll()).toEqual([]);
});

it("keeps Plex as the source of truth after an uncertain write and permits retry", async () => {
  write.mockRejectedValueOnce(new Error("timeout"));
  await act(async () => {
    expect(
      await state.change({
        type: "edit",
        member: overview.members[1],
        title: "Changed",
        restrictionProfile: "teen",
      }),
    ).toBe(false);
  });
  await flush();
  expect(state.mutationError).toBe("timeout");
  expect(read).toHaveBeenCalledTimes(2);
  expect(state.data?.members[1].title).toBe("Child");
  await act(async () => {
    expect(
      await state.change({
        type: "edit",
        member: overview.members[1],
        title: "Changed",
        restrictionProfile: "teen",
      }),
    ).toBe(true);
  });
  expect(state.mutationError).toBeNull();
});

it("blocks duplicate writes and does not retain PIN mutation variables", async () => {
  let finish!: () => void;
  write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = state.change({
      type: "pin",
      member: overview.members[1],
      pin: "1234",
      currentPin: "",
    });
  });
  await act(async () => {
    expect(
      await state.change({ type: "remove", member: overview.members[1] }),
    ).toBe(false);
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(serverQueryClient.getMutationCache().getAll()).toEqual([]);
  await act(async () => {
    finish();
    await saving;
  });
});

it("cancels a pending write on profile change and ignores its late result", async () => {
  let finish!: () => void;
  write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = state.change({
      type: "edit",
      member: overview.members[1],
      title: "Old write",
      restrictionProfile: "teen",
    });
  });
  const signal = write.mock.calls[0][3]!;
  read.mockResolvedValue({ ...overview, canManage: false });
  await act(async () => {
    AuthStorage.saveActiveSession({
      profile: child,
      accountToken: "child-account-token",
      serverToken: "child-server-token",
    });
    useAuthSession.setState({
      revision: 2,
      activeProfile: child,
      activeUser: { id: 2 } as Plex.UserData,
    });
  });
  await flush();
  expect(signal.aborted).toBe(true);
  const reads = read.mock.calls.length;
  await act(async () => {
    finish();
    expect(await saving).toBe(false);
  });
  expect(read).toHaveBeenCalledTimes(reads);
  expect(state.pending).toBe(false);
  expect(state.mutationError).toBeNull();
  expect(AuthStorage.getProfileAccountToken()).toBe("child-account-token");
});

it("aborts a write when the Home screen is unmounted", async () => {
  let finish!: () => void;
  write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = state.change({ type: "remove", member: overview.members[1] });
  });
  const signal = write.mock.calls[0][3]!;
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  await act(async () => {
    finish();
    expect(await saving).toBe(false);
  });
  expect(read).toHaveBeenCalledTimes(1);
});

it("does not report a saved change to a new profile while revalidation is pending", async () => {
  let finishRead!: (value: PlexHomeOverview) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = state.change({
      type: "edit",
      member: overview.members[1],
      title: "Changed",
      restrictionProfile: "teen",
    });
  });
  expect(read).toHaveBeenCalledTimes(2);
  read.mockResolvedValue({ ...overview, canManage: false });
  await act(async () => {
    AuthStorage.saveActiveSession({
      profile: child,
      accountToken: "child-account-token",
      serverToken: "child-server-token",
    });
    useAuthSession.setState({ revision: 2, activeProfile: child });
  });
  await act(async () => {
    finishRead(overview);
    expect(await saving).toBe(false);
  });
  expect(AuthStorage.getProfileAccountToken()).toBe("child-account-token");
});

it("invalidates shared library access when Home membership changes", async () => {
  const key = ["plex-sharing", "server", 1];
  serverQueryClient.setQueryData(key, { libraries: [], shares: [] });
  await act(async () => {
    expect(
      await state.change({ type: "remove", member: overview.members[1] }),
    ).toBe(true);
  });
  expect(serverQueryClient.getQueryState(key)?.isInvalidated).toBe(true);
});

it("does not send a Home write after sign-out even before its screen unmounts", async () => {
  await act(async () => {
    useAuthSession.setState({ status: "signedOut" });
    expect(
      await state.change({ type: "remove", member: overview.members[1] }),
    ).toBe(false);
  });
  expect(write).not.toHaveBeenCalled();
});
