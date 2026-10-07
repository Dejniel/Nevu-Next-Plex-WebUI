import { notifyManager } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { normalizePlexPreferences } from "@nevu/contracts";
import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { usePreferenceDraft } from "entities/plex-preferences/model";
import { serverQueryClient } from "shared/api/queryClient";
import {
  getServerPreferences,
  updateServerPreferences,
} from "../api/serverPreferences";
import { useServerPreferences } from "./useServerPreferences";

vi.mock("../api/serverPreferences", () => ({
  getServerPreferences: vi.fn(),
  updateServerPreferences: vi.fn(),
}));
const read = vi.mocked(getServerPreferences);
const write = vi.mocked(updateServerPreferences);
const initial = normalizePlexPreferences([
  { id: "FriendlyName", type: "text", value: "Test", default: "" },
  { id: "ratio", type: "double", value: 0.75, default: 0.5 },
]);
let root: Root;
let host: HTMLDivElement;
let controller: ReturnType<typeof useServerPreferences>;
let draft: ReturnType<typeof usePreferenceDraft>;
function OtherReader() {
  useServerPreferences();
  return null;
}
function Harness() {
  controller = useServerPreferences();
  draft = usePreferenceDraft(controller.query.data ?? []);
  return <OtherReader />;
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
  useAuthSession.setState({
    status: "ready",
    revision: 1,
    activeUser: { restricted: false } as Plex.UserData,
  });
  useServerSession.setState({
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
    canManageServer: true,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  read.mockResolvedValue(initial);
  write.mockImplementation(async (_token, changes) => changes);
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

it("shares one native Query resource and supplies frozen credentials and cancellation", () => {
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith("account", expect.any(AbortSignal));
  expect(
    serverQueryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey),
  ).toEqual([["plex-server-preferences", "local", 1]]);
});

it("retains edited fields while accepting untouched values from a background refresh", async () => {
  await act(async () => draft.setValue("FriendlyName", "Unsaved"));
  read.mockResolvedValueOnce(
    initial.map((setting) => ({
      ...setting,
      value: setting.id === "ratio" ? "0.9" : "External",
    })),
  );
  await act(async () => {
    await controller.query.refetch();
  });
  expect(draft.draft.FriendlyName).toBe("Unsaved");
  expect(draft.changes).toEqual({ FriendlyName: "Unsaved" });
  expect(controller.query.data?.[1].value).toBe("0.9");
});

it("stops overriding a field reverted to its server value", async () => {
  await act(async () => draft.setValue("FriendlyName", "Unsaved"));
  await act(async () => draft.setValue("FriendlyName", "Test"));
  read.mockResolvedValueOnce(
    initial.map((setting) => ({
      ...setting,
      value: setting.id === "FriendlyName" ? "External" : setting.value,
    })),
  );
  await act(async () => {
    await controller.query.refetch();
  });
  expect(draft.draft).toEqual({});
  expect(controller.query.data?.[0].value).toBe("External");
});

it("publishes a confirmed save even if revalidation fails, while exposing the read error", async () => {
  read.mockRejectedValueOnce(new Error("Reload failed"));
  await act(async () => {
    await controller.save.mutateAsync({ FriendlyName: "Saved" });
  });
  expect(controller.save.isSuccess).toBe(true);
  expect(controller.query.data?.[0].value).toBe("Saved");
  expect(controller.query.error?.message).toBe("Reload failed");
});

it("revalidates uncertain writes without losing the draft or automatically retrying", async () => {
  await act(async () => draft.setValue("FriendlyName", "Unsaved"));
  write.mockRejectedValueOnce(new Error("Write failed"));
  await act(async () => {
    await expect(controller.save.mutateAsync(draft.changes)).rejects.toThrow(
      "Write failed",
    );
  });
  expect(read).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledTimes(1);
  expect(draft.draft.FriendlyName).toBe("Unsaved");
  await act(async () => {
    await controller.save.mutateAsync(draft.changes);
  });
  expect(write).toHaveBeenCalledTimes(2);
});

it.each(["profile", "server", "sign-out", "permission", "unmount"])(
  "cancels a save after %s and rejects late success",
  async (change) => {
    let finish!: () => void;
    write.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ FriendlyName: "Late" });
        }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = controller.save.mutateAsync({ FriendlyName: "Late" });
      void pending.catch(() => undefined);
    });
    const signal = write.mock.calls[0][2];
    await act(async () => {
      if (change === "profile") useAuthSession.setState({ revision: 2 });
      else if (change === "server")
        useServerSession.setState({
          server: { machineIdentifier: "other" } as Plex.ServerPreferences,
        });
      else if (change === "sign-out")
        useAuthSession.setState({ status: "signedOut" });
      else if (change === "permission")
        useServerSession.setState({ canManageServer: false });
      else root.render(null);
    });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      finish();
      await expect(pending).rejects.toThrow();
    });
    expect(
      serverQueryClient.getQueryData<typeof initial>([
        "plex-server-preferences",
        "local",
        1,
      ])?.[0].value,
    ).toBe("Test");
  },
);

it("blocks a stale callback before sending a write", async () => {
  await act(async () => {
    useAuthSession.setState({ revision: 2 });
    await expect(
      controller.save.mutateAsync({ FriendlyName: "Late" }),
    ).rejects.toThrow("session changed");
  });
  expect(write).not.toHaveBeenCalled();
});

it("does not publish success after a session change during revalidation", async () => {
  let finish!: (value: typeof initial) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const success = vi.fn();
  await act(async () =>
    controller.save.mutate({ FriendlyName: "Saved" }, { onSuccess: success }),
  );
  await act(async () => useAuthSession.setState({ revision: 2 }));
  await act(async () => finish(initial));
  await flush();
  expect(success).not.toHaveBeenCalled();
});
