import { notifyManager } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  createShare,
  deleteShare,
  getSharingOverview,
  updateShare,
} from "../api/sharing";
import type { SharingOverview } from "../api/sharing";
import { useSharingChange, useSharingOverview } from "./useSharing";

vi.mock("../api/sharing", () => ({
  createShare: vi.fn(),
  deleteShare: vi.fn(),
  getSharingOverview: vi.fn(),
  updateShare: vi.fn(),
}));
const read = vi.mocked(getSharingOverview);
const write = vi.mocked(updateShare);
const initial: SharingOverview = {
  libraries: [{ id: "1", title: "Movies", type: "movie" }],
  shares: [],
};
const input = { librarySectionIds: ["1"], allowDownloads: false };
let root: Root;
let host: HTMLDivElement;
let overview: ReturnType<typeof useSharingOverview>;
let mutation: ReturnType<typeof useSharingChange>;

function OtherScreen() {
  useSharingOverview(true);
  return null;
}
function Harness() {
  overview = useSharingOverview(true);
  mutation = useSharingChange();
  return <OtherScreen />;
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
beforeEach(async () => {
  vi.resetAllMocks();
  serverQueryClient.clear();
  localStorage.clear();
  sessionStorage.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  useAuthSession.setState({ status: "ready", revision: 1 });
  useServerSession.setState({
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
  });
  read.mockResolvedValue(initial);
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

it("shares one profile/server-scoped Query resource between both screens", () => {
  expect(read).toHaveBeenCalledTimes(1);
  expect(
    serverQueryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey),
  ).toEqual([["plex-sharing", "local", 1]]);
});

it.each(["create", "update", "remove"] as const)(
  "refreshes both readers after a %s without maintaining a data mirror",
  async (type) => {
    const updated = {
      ...initial,
      libraries: [{ ...initial.libraries[0], title: "Updated" }],
    };
    read.mockResolvedValueOnce(updated);
    await act(async () => {
      await mutation.mutateAsync(
        type === "create"
          ? { type, input: { ...input, invitedId: 2 } }
          : type === "update"
            ? { type, id: 42, input }
            : { type, id: 42 },
      );
    });
    await flush();
    expect(read).toHaveBeenCalledTimes(2);
    expect(overview.data).toEqual(updated);
    const calls = [createShare, updateShare, deleteShare].reduce(
      (count, fn) => count + vi.mocked(fn).mock.calls.length,
      0,
    );
    expect(calls).toBe(1);
  },
);

it("revalidates an uncertain write, retains its error and allows an explicit retry", async () => {
  write.mockRejectedValueOnce(new Error("timeout"));
  await act(async () => {
    await expect(
      mutation.mutateAsync({ type: "update", id: 42, input }),
    ).rejects.toThrow("timeout");
  });
  await flush();
  expect(read).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledTimes(1);
  expect(mutation.error?.message).toBe("timeout");
  await act(async () => {
    await mutation.mutateAsync({ type: "update", id: 42, input });
  });
  expect(write).toHaveBeenCalledTimes(2);
});

it("keeps a confirmed save successful when the subsequent read fails", async () => {
  read.mockRejectedValueOnce(new Error("Reload failed"));
  await act(async () => {
    await mutation.mutateAsync({ type: "update", id: 42, input });
  });
  await flush();
  expect(mutation.isSuccess).toBe(true);
  expect(overview.error?.message).toBe("Reload failed");
  expect(write).toHaveBeenCalledTimes(1);
});

it.each(["profile", "server", "sign-out", "unmount"])(
  "cancels a pending write after %s and rejects its late success",
  async (change) => {
    let finish!: () => void;
    write.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = mutation.mutateAsync({ type: "update", id: 42, input });
      // Keep the rejection observed while the request is deliberately unresolved.
      void pending.catch(() => undefined);
    });
    const signal = write.mock.calls[0][2]!;
    await act(async () => {
      if (change === "profile") useAuthSession.setState({ revision: 2 });
      else if (change === "server")
        useServerSession.setState({
          server: { machineIdentifier: "other" } as Plex.ServerPreferences,
        });
      else if (change === "sign-out")
        useAuthSession.setState({ status: "signedOut" });
      else root.render(null);
    });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      finish();
      await expect(pending).rejects.toThrow();
    });
  },
);

it("does not run success callbacks in a new session while revalidation is pending", async () => {
  let finish!: (data: SharingOverview) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const success = vi.fn();
  await act(async () => {
    mutation.mutate({ type: "update", id: 42, input }, { onSuccess: success });
  });
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => useAuthSession.setState({ revision: 2 }));
  await act(async () => finish(initial));
  await flush();
  expect(success).not.toHaveBeenCalled();
  expect(write.mock.calls[0][2]!.aborted).toBe(true);
});

it("blocks a stale action before it reaches the sharing API", async () => {
  await act(async () => {
    useAuthSession.setState({ status: "signedOut" });
    await expect(
      mutation.mutateAsync({ type: "remove", id: 42 }),
    ).rejects.toThrow("session changed");
  });
  expect(deleteShare).not.toHaveBeenCalled();
});
