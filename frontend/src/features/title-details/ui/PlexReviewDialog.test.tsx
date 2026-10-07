import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import PlexReviewDialog from "./PlexReviewDialog";
import { savePlexReview, type PlexReview } from "../api/plexCommunity";

vi.mock("../api/plexCommunity", () => ({ savePlexReview: vi.fn() }));
vi.mock("shared/ui", async () => ({
  AppDialog: (await import("shared/ui/AppDialog")).default,
}));
const save = vi.mocked(savePlexReview);
const review: PlexReview = {
  id: "own",
  date: "2026-10-05",
  message: "Existing review",
  reviewRating: 8,
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

async function editText(text: string) {
  const input = document.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function saveButton() {
  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Save review",
  )!;
}

it("edits text and spoilers while preserving the Plex review identity and rating", async () => {
  const onSaved = vi.fn();
  const result = { ...review, message: "Updated review", hasSpoilers: true };
  save.mockResolvedValue(result);
  await act(async () =>
    root.render(
      <PlexReviewDialog
        metadataID="movie"
        review={review}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    ),
  );
  await editText(" Updated review ");
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await act(async () => saveButton().click());
  expect(save).toHaveBeenCalledWith(
    {
      metadata: "movie",
      message: "Updated review",
      hasSpoilers: true,
      rating: 8,
    },
    "own",
    expect.any(AbortSignal),
  );
  expect(onSaved).toHaveBeenCalledWith(result);
});

it("keeps the draft and shows the Plex error when a save fails", async () => {
  save.mockRejectedValue(new Error("Verify your Plex email first"));
  const onSaved = vi.fn();
  await act(async () =>
    root.render(
      <PlexReviewDialog
        metadataID="movie"
        review={null}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    ),
  );
  expect(saveButton().disabled).toBe(true);
  await editText("My review");
  await act(async () => saveButton().click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Verify your Plex email first",
  );
  expect(document.querySelector("textarea")?.value).toBe("My review");
  expect(onSaved).not.toHaveBeenCalled();
  expect(saveButton().disabled).toBe(false);
  save.mockResolvedValue({ ...review, message: "My review" });
  await act(async () => saveButton().click());
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it("prevents duplicate saves and closing while the request is pending", async () => {
  save.mockImplementation(() => new Promise(() => {}));
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      <PlexReviewDialog
        metadataID="movie"
        review={review}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    ),
  );
  await act(async () => {
    saveButton().click();
    saveButton().click();
  });
  await act(async () =>
    document
      .querySelector('[role="dialog"]')!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledTimes(1);
  expect(
    Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Saving…",
    )?.disabled,
  ).toBe(true);
});

it("cancels pending requests on unmount and ignores their late result", async () => {
  let finish!: (review: PlexReview) => void;
  save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onSaved = vi.fn();
  await act(async () =>
    root.render(
      <PlexReviewDialog
        metadataID="movie"
        review={review}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    ),
  );
  await act(async () => saveButton().click());
  const signal = save.mock.calls[0][2]!;
  await act(async () => root.render(null));
  await act(async () => finish(review));
  expect(signal.aborted).toBe(true);
  expect(onSaved).not.toHaveBeenCalled();
});
