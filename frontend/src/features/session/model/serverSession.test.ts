import { getServerSessionContext } from "../api/server";
import { AuthStorage } from "./authStorage";
import { useServerSession } from "./serverSession";

jest.mock("../api/server", () => ({ getServerSessionContext: jest.fn() }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.resetAllMocks();
  useServerSession.getState().reset();
});

it("loads server details and management capability for the active session", async () => {
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  (getServerSessionContext as jest.Mock).mockResolvedValue({
    server: { friendlyName: "Media" },
    providers: { Feature: [{ type: "manage" }] },
  });

  await useServerSession.getState().refresh();

  expect(useServerSession.getState()).toMatchObject({
    server: { friendlyName: "Media" },
    canManageServer: true,
  });
});

it("does not restore a stale response after the session is reset", async () => {
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  let resolveRequest!: (value: unknown) => void;
  (getServerSessionContext as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveRequest = resolve;
    }),
  );

  const refresh = useServerSession.getState().refresh();
  useServerSession.getState().reset();
  resolveRequest({
    server: { friendlyName: "Old server" },
    providers: { Feature: [{ type: "manage" }] },
  });
  await refresh;

  expect(useServerSession.getState()).toMatchObject({
    server: null,
    canManageServer: false,
  });
});
