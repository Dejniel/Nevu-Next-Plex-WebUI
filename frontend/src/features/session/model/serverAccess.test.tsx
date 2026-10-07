import { act } from "react";
import { createRoot } from "react-dom/client";
import { useAuthSession } from "./authSession";
import { useServerSession } from "./serverSession";
import { useCanManageServer } from "./serverAccess";

it("uses active-user permissions instead of whether it was the account used to log in", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  let canManage = false;
  function Harness() {
    canManage = useCanManageServer();
    return null;
  }
  try {
    useAuthSession.setState({
      activeProfile: {
        id: 1,
        title: "Admin",
        isOwner: false,
        protected: true,
        restricted: false,
      },
      activeUser: { id: 1, restricted: false } as Plex.UserData,
    });
    useServerSession.setState({ canManageServer: true });
    await act(async () => root.render(<Harness />));
    expect(canManage).toBe(true);
    await act(async () =>
      useAuthSession.setState({
        activeUser: { id: 2, restricted: true } as Plex.UserData,
      }),
    );
    expect(canManage).toBe(false);
    await act(async () => {
      useAuthSession.setState({
        activeUser: { id: 3, restricted: false } as Plex.UserData,
      });
      useServerSession.setState({ canManageServer: false });
    });
    expect(canManage).toBe(false);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
