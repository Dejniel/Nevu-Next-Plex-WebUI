import type { Mock } from "vitest";
import { getLibraries } from "../api/libraries";
import { useLibraries } from "./libraries";

vi.mock("../api/libraries", () => ({ getLibraries: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  useLibraries.getState().reset();
});

it("ignores a library response from a reset profile", async () => {
  let resolveRequest!: (libraries: Plex.LibarySection[]) => void;
  (getLibraries as Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveRequest = resolve;
    }),
  );

  const load = useLibraries.getState().load();
  useLibraries.getState().reset();
  resolveRequest([{ key: "1", title: "Old library" } as Plex.LibarySection]);
  await load;

  expect(useLibraries.getState()).toMatchObject({
    libraries: null,
    loading: false,
    error: null,
  });
});
