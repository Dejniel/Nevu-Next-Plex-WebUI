import { act, useState } from "react";
import { notifyManager } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { AuthStorage, useAuthSession } from "features/session/model";
import { serverQueryClient as client } from "shared/api/queryClient";
import TitleReviews from "./TitleReviews";
import TitleReviewEditor from "./TitleReviewEditor";
import { titleReviewsQueryOptions } from "../model/titleReviewsQuery";
import {
  getPlexReviews,
  savePlexReview,
  type PlexReviews,
  type PlexReview,
} from "../api/plexCommunity";

vi.mock("../api/plexCommunity", () => ({
  getPlexReviews: vi.fn(),
  savePlexReview: vi.fn(),
}));
vi.mock("shared/ui", async () => ({
  AppDialog: (await import("shared/ui/AppDialog")).default,
}));
const get = vi.mocked(getPlexReviews);
const save = vi.mocked(savePlexReview);
beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
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
  client.clear();
  localStorage.clear();
  sessionStorage.clear();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "server",
  });
  useAuthSession.setState({
    status: "ready",
    ownerUser: { id: 1 } as Plex.UserData,
    activeProfile: {
      id: 1,
      title: "Owner",
      protected: false,
      restricted: false,
      isOwner: true,
    },
    activeUser: { confirmed: true } as Plex.UserData,
    revision: 1,
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.unstubAllGlobals();
});

it("keeps critic reviews visible when the Plex community is unavailable", async () => {
  get.mockRejectedValue(new Error("offline"));
  await act(async () =>
    root.render(
      <TitleReviews
        onWriteReview={vi.fn()}
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
  expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
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
  expect(
    host.querySelector('section[aria-label="Recent reviews"]')?.textContent,
  ).toContain("Secret ending");
  expect(host.querySelector('section[aria-label="Your review"]')).toBeNull();
});

it("puts your review first in Recent, without duplicating it in other sections", async () => {
  const own = {
    id: "own",
    date: "2026-01-01",
    message: "My older review",
    status: "PENDING",
  };
  const recent = {
    id: "recent",
    date: "2026-10-05",
    message: "A newer review",
  };
  const top = { id: "top", date: "2026-10-05", message: "A popular review" };
  get.mockResolvedValue({
    userReview: own,
    recentReviews: { nodes: [recent, own, top] },
    topReviews: { nodes: [top, own] },
    friendReviews: { nodes: [own] },
  });
  const write = vi.fn();
  await act(async () =>
    root.render(
      <TitleReviews
        onWriteReview={write}
        data={
          {
            guid: "plex://movie/one",
            Review: [{ id: "critic", text: "Critic opinion" }],
          } as unknown as Plex.Metadata
        }
      />,
    ),
  );
  const section = host.querySelector('section[aria-label="Recent reviews"]')!;
  expect(section.textContent!.indexOf("My older review")).toBeLessThan(
    section.textContent!.indexOf("A newer review"),
  );
  expect(host.textContent!.match(/My older review/g)).toHaveLength(1);
  expect(section.textContent).toContain("Your review is awaiting moderation.");
  expect(section.textContent).not.toContain("A popular review");
  expect(host.querySelector('section[aria-label="Your review"]')).toBeNull();
  const buttons = Array.from(host.querySelectorAll("button"));
  expect(buttons).toHaveLength(2);
  expect(
    buttons.map((button) =>
      button.closest("section")?.getAttribute("aria-label"),
    ),
  ).toEqual(["Critic reviews", "Recent reviews"]);
  for (const button of buttons) await act(async () => button.click());
  expect(write).toHaveBeenCalledTimes(2);
});

const movie = { guid: "plex://movie/one", ratingKey: "1" } as Plex.Metadata;
function EditorHarness() {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <TitleReviews data={movie} onWriteReview={() => setEditing(true)} />
      {editing && (
        <TitleReviewEditor item={movie} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
async function openEditor() {
  await act(async () => root.render(<EditorHarness />));
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click(),
  );
}
async function saveText(message: string) {
  const input = document.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, message);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const button = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Save review",
  )!;
  await act(async () => button.click());
}

it("shares reviews with the editor and immediately adds the saved review first in Recent", async () => {
  const other = { id: "other", date: "2026-10-05", message: "Another opinion" };
  get.mockResolvedValue({ ...empty, recentReviews: { nodes: [other] } });
  save.mockResolvedValue({
    id: "own",
    date: "2026-10-06",
    message: "My new opinion",
  });
  await openEditor();
  expect(get).toHaveBeenCalledTimes(1);
  await saveText("My new opinion");
  expect(save).toHaveBeenCalledWith(
    {
      metadata: "one",
      message: "My new opinion",
      hasSpoilers: false,
      rating: null,
    },
    undefined,
    expect.any(AbortSignal),
  );
  const recent = host.querySelector(
    'section[aria-label="Recent reviews"]',
  )!.textContent!;
  expect(recent.indexOf("My new opinion")).toBeLessThan(
    recent.indexOf("Another opinion"),
  );
  expect(get).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("does not let a stale background read restore the previous review after saving", async () => {
  const own = {
    id: "own",
    date: "2026-10-05",
    message: "Previous opinion",
    reviewRating: 8,
  };
  get.mockResolvedValue({ ...empty, userReview: own });
  await openEditor();
  expect(document.querySelector("textarea")?.value).toBe("Previous opinion");
  let finishRead!: (reviews: PlexReviews) => void;
  get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  await act(async () => {
    void client.invalidateQueries({
      queryKey: titleReviewsQueryOptions("1:1", movie.guid).queryKey,
    });
  });
  const signal = get.mock.calls[1][1]!;
  save.mockResolvedValue({ ...own, message: "Updated opinion" });
  await saveText("Updated opinion");
  await act(async () => finishRead({ ...empty, userReview: own }));
  expect(signal.aborted).toBe(true);
  expect(host.textContent).toContain("Updated opinion");
  expect(host.textContent).not.toContain("Previous opinion");
  expect(save.mock.calls[0][0].rating).toBe(8);
});

it("cancels an old profile's pending save and keeps its late result out of the new profile", async () => {
  get.mockResolvedValue(empty);
  let finishSave!: (review: PlexReview) => void;
  save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  await openEditor();
  await saveText("Old profile opinion");
  const signal = save.mock.calls[0][2]!;
  await act(async () =>
    useAuthSession.setState({
      activeProfile: {
        id: 2,
        title: "Other",
        protected: false,
        restricted: false,
        isOwner: false,
      },
      revision: 2,
    }),
  );
  await act(async () =>
    finishSave({
      id: "old",
      date: "2026-10-06",
      message: "Old profile opinion",
    }),
  );
  expect(signal.aborted).toBe(true);
  expect(host.textContent).not.toContain("Old profile opinion");
  expect(
    client.getQueryData<PlexReviews>(
      titleReviewsQueryOptions("1:2", movie.guid).queryKey,
    )?.userReview,
  ).toBeNull();
});

it("keeps the Recent heading and write action when community reviews are empty", async () => {
  get.mockResolvedValue(empty);
  await act(async () =>
    root.render(
      <TitleReviews
        data={{ guid: "plex://movie/one" } as Plex.Metadata}
        onWriteReview={vi.fn()}
      />,
    ),
  );
  const section = host.querySelector('section[aria-label="Recent reviews"]')!;
  expect(section.textContent).toContain("No recent reviews yet.");
  expect(section.querySelector<HTMLButtonElement>("button")?.disabled).toBe(
    false,
  );
});

it("does not publish a late review after sign-out without a revision change", async () => {
  get.mockResolvedValue(empty);
  let finish!: (review: PlexReview) => void;
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await openEditor();
  await saveText("Signed-out opinion");
  await act(async () => useAuthSession.setState({ status: "signedOut" }));
  await act(async () =>
    finish({ id: "own", date: "2026-10-07", message: "Signed-out opinion" }),
  );
  expect(
    client.getQueryData<PlexReviews>(
      titleReviewsQueryOptions("1:1", movie.guid).queryKey,
    )?.userReview,
  ).toBeNull();
  expect(host.textContent).not.toContain("Signed-out opinion");
});
