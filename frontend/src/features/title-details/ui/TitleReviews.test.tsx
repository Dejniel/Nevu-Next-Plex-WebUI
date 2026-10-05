import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TitleReviews from "./TitleReviews";
import { getPlexReviews, type PlexReviews } from "../api/plexCommunity";

vi.mock("../api/plexCommunity", () => ({ getPlexReviews: vi.fn() }));
const get = vi.mocked(getPlexReviews);
const empty: PlexReviews = {
  userReview: null,
  friendReviews: { nodes: [] },
  recentReviews: { nodes: [] },
  topReviews: { nodes: [] },
};
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("keeps critic reviews visible when the Plex community is unavailable", async () => {
  get.mockRejectedValue(new Error("offline"));
  await act(async () =>
    root.render(
      <TitleReviews
        data={
          {
            guid: "plex://movie/one",
            Review: [
              {
                id: "critic",
                text: "A critic review",
                tag: "Author",
                source: "Source",
              },
            ],
          } as unknown as Plex.Metadata
        }
      />,
    ),
  );
  expect(host.textContent).toContain("A critic review");
  expect(host.textContent).toContain(
    "Plex community reviews are temporarily unavailable.",
  );
  expect(host.querySelector("a")?.href).toBe("https://app.plex.tv/");
});

it("cancels old title requests and ignores their late responses", async () => {
  let finishOld!: (reviews: PlexReviews) => void;
  get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  get.mockResolvedValueOnce(empty);
  await act(async () =>
    root.render(
      <TitleReviews data={{ guid: "plex://movie/one" } as Plex.Metadata} />,
    ),
  );
  const oldSignal = get.mock.calls[0][1]!;
  await act(async () =>
    root.render(
      <TitleReviews data={{ guid: "plex://movie/two" } as Plex.Metadata} />,
    ),
  );
  await act(async () =>
    finishOld({
      ...empty,
      topReviews: {
        nodes: [{ id: "old", date: "2026-01-01", message: "Old title review" }],
      },
    }),
  );
  expect(oldSignal.aborted).toBe(true);
  expect(host.textContent).toContain(
    "No reviews available for this title yet.",
  );
  expect(host.textContent).not.toContain("Old title review");
});

it("protects spoilers with an explicit expandable control and tolerates invalid dates", async () => {
  get.mockResolvedValue({
    ...empty,
    userReview: {
      id: "own",
      date: "invalid",
      hasSpoilers: true,
      message: "Secret ending",
    },
  });
  await act(async () =>
    root.render(
      <TitleReviews data={{ guid: "plex://movie/one" } as Plex.Metadata} />,
    ),
  );
  expect(host.querySelector("summary")?.textContent).toBe("Show spoilers");
  expect(host.querySelector("details")?.open).toBe(false);
  expect(host.textContent).toContain("Your review");
});
