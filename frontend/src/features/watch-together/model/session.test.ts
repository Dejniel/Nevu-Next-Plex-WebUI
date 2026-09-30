import { Socket } from "socket.io-client";
import { createWatchTogetherSocket } from "../api/socket";
import { useWatchTogetherSession } from "./session";

jest.mock("../api/socket", () => ({
  createWatchTogetherSocket: jest.fn(),
}));

type Handler = (...args: any[]) => void;

interface SocketStub {
  on: jest.Mock<SocketStub, [string, Handler]>;
  once: jest.Mock<SocketStub, [string, Handler]>;
  off: jest.Mock<SocketStub, [string, Handler]>;
  connect: jest.Mock<SocketStub, []>;
  disconnect: jest.Mock<SocketStub, []>;
  trigger: (event: string, ...args: any[]) => void;
}

function socketStub() {
  const handlers = new Map<string, { handler: Handler; once: boolean }[]>();
  const socket: SocketStub = {
    on: jest.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) || []), { handler, once: false }]);
      return socket;
    }),
    once: jest.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) || []), { handler, once: true }]);
      return socket;
    }),
    off: jest.fn((event: string, handler: Handler) => {
      handlers.set(
        event,
        (handlers.get(event) || []).filter((entry) => entry.handler !== handler),
      );
      return socket;
    }),
    connect: jest.fn(() => socket),
    disconnect: jest.fn(() => {
      socket.trigger("disconnect");
      return socket;
    }),
    trigger: (event: string, ...args: any[]) => {
      const listeners = [...(handlers.get(event) || [])];
      handlers.set(
        event,
        listeners.filter((entry) => !entry.once),
      );
      listeners.forEach((entry) => entry.handler(...args));
    },
  };
  return socket;
}

const createSocketMock = createWatchTogetherSocket as jest.MockedFunction<
  typeof createWatchTogetherSocket
>;

describe("watch-together session", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWatchTogetherSession.setState({
      socket: null,
      status: "disconnected",
      isHost: false,
      room: null,
    });
  });

  it("moves from connecting to a ready hosted session", async () => {
    const socket = socketStub();
    createSocketMock.mockReturnValue(socket as unknown as Socket);

    const connection = useWatchTogetherSession.getState().connect();
    expect(useWatchTogetherSession.getState()).toMatchObject({
      socket,
      status: "connecting",
      room: null,
    });

    socket.trigger("ready", { host: true, room: "a1b2c3" });

    await expect(connection).resolves.toBe(true);
    expect(useWatchTogetherSession.getState()).toMatchObject({
      socket,
      status: "connected",
      isHost: true,
      room: "a1b2c3",
    });
  });

  it("clears a failed connection and returns the server error", async () => {
    const socket = socketStub();
    createSocketMock.mockReturnValue(socket as unknown as Socket);
    const error = { type: "invalid_room", message: "Invalid room" };

    const connection = useWatchTogetherSession.getState().connect("missing");
    socket.trigger("conn-error", error);

    await expect(connection).resolves.toEqual(error);
    expect(useWatchTogetherSession.getState()).toMatchObject({
      socket: null,
      status: "disconnected",
      isHost: false,
      room: null,
    });
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
