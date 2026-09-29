import { getAllLibraries } from "../plex";
import { useLibraries } from "./LibrariesState";

jest.mock("../plex", () => ({ getAllLibraries: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
  useLibraries.getState().reset();
});

it("ignores a library response from a reset profile", async () => {
  let resolveRequest!: (libraries: Plex.LibarySection[]) => void;
  (getAllLibraries as jest.Mock).mockReturnValue(
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
