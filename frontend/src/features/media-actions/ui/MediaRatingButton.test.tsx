import type { MediaMetadata } from "entities/media/model";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import MediaRatingButton from "./MediaRatingButton";
import { setMediaRating } from "../api/rating";
import { useAuthSession } from "features/session/model";

vi.mock("../api/rating", () => ({ setMediaRating: vi.fn() }));
const save = vi.mocked(setMediaRating);
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.resetAllMocks();
  useAuthSession.setState({ revision: 1 });
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

async function clearRating(
  item: MediaMetadata,
  onChanged: (rating: number | undefined) => void,
) {
  await act(async () =>
    root.render(<MediaRatingButton item={item} onChanged={onChanged} />),
  );
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Your rating: 8.0/10"]',
  )!;
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 38, 38),
  );
  await act(async () => trigger.click());
  const clear = Array.from(document.querySelectorAll("button")).find(
    (button) => button.getAttribute("aria-label") === "Clear rating",
  )!;
  await act(async () => clear.click());
  return clear;
}

it("clears a rating only after Plex accepts the change, without mutating the item", async () => {
  const item = { ratingKey: "12", userRating: 8 } as MediaMetadata;
  const onChanged = vi.fn();
  save.mockResolvedValue(true);
  await clearRating(item, onChanged);
  expect(onChanged).toHaveBeenCalledWith(undefined);
  expect(save).toHaveBeenCalledWith(-1, "12", expect.any(AbortSignal));
  expect(item.userRating).toBe(8);
});

it("keeps focus in the rating dialog while saving so Escape still closes it", async () => {
  let finish!: (saved: boolean) => void;
  save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () =>
    root.render(
      <MediaRatingButton
        item={{ ratingKey: "12", userRating: 8 }}
        onChanged={vi.fn()}
      />,
    ),
  );
  const trigger = host.querySelector<HTMLButtonElement>("button")!;
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 38, 38),
  );
  await act(async () => trigger.click());
  const clear = document.querySelector<HTMLButtonElement>(
    '[aria-label="Clear rating"]',
  )!;
  await act(async () => {
    clear.focus();
    clear.click();
  });
  expect(clear.disabled).toBe(true);
  const paper = document.querySelector<HTMLDivElement>(".MuiPopover-paper")!;
  expect(document.activeElement).toBe(paper);
  await act(async () =>
    paper.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await vi.waitFor(() =>
    expect(document.querySelector(".MuiPopover-paper")).toBeNull(),
  );
  await act(async () => finish(true));
});

it.each([false, new Error("offline")])(
  "keeps the rating and offers retry after a failed save",
  async (result) => {
    const item = { ratingKey: "12", userRating: 8 } as MediaMetadata;
    const onChanged = vi.fn();
    if (result instanceof Error) save.mockRejectedValue(result);
    else save.mockResolvedValue(result);
    const clear = await clearRating(item, onChanged);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Plex could not save your rating",
    );
    expect(onChanged).not.toHaveBeenCalled();
    expect(clear.disabled).toBe(false);
  },
);

it("disables the clear icon without a rating and opens reviews independently", async () => {
  const onWriteReview = vi.fn();
  await act(async () =>
    root.render(
      <MediaRatingButton
        item={{ ratingKey: "12" } as MediaMetadata}
        onChanged={vi.fn()}
        onWriteReview={onWriteReview}
      />,
    ),
  );
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Rate this title"]',
  )!;
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 38, 38),
  );
  await act(async () => trigger.click());
  const clear = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Clear rating"]',
  )!;
  expect(clear.disabled).toBe(true);
  expect(clear.getAttribute("title")).toBeNull();
  const write = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Write your own review",
  )!;
  await act(async () => write.click());
  expect(onWriteReview).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
});

it.each(["title", "profile"])(
  "cancels pending rating saves when the %s changes and ignores late results",
  async (change) => {
    let finish!: (saved: boolean) => void;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const item = { ratingKey: "12", userRating: 8 } as MediaMetadata;
    const onChanged = vi.fn();
    await clearRating(item, onChanged);
    const signal = save.mock.calls[0][2]!;
    await act(async () => {
      if (change === "profile") useAuthSession.setState({ revision: 2 });
      else
        root.render(
          <MediaRatingButton
            item={{ ratingKey: "13" } as MediaMetadata}
            onChanged={onChanged}
          />,
        );
    });
    await act(async () => finish(true));
    expect(signal.aborted).toBe(true);
    expect(onChanged).not.toHaveBeenCalled();
  },
);

it("offers the same 0–10 scale when selecting stars", async () => {
  const item = { ratingKey: "12", userRating: 8 } as MediaMetadata;
  save.mockResolvedValue(true);
  await clearRating(item, vi.fn());
  expect(document.querySelector(".MuiPopover-paper")?.textContent).toContain(
    "Your rating: 8.0/10",
  );
  expect(
    document.querySelector<HTMLInputElement>('input[value="5"]')?.labels?.[0]
      .textContent,
  ).toContain("10.0/10");
  expect(
    document.querySelector<HTMLInputElement>('input[value="0.5"]')?.labels?.[0]
      .textContent,
  ).toContain("1.0/10");
});
