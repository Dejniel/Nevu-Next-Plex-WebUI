import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TitleRatingButton from "./TitleRatingButton";
import { setMediaRating } from "../api/rating";

vi.mock("../api/rating", () => ({ setMediaRating: vi.fn() }));
const save = vi.mocked(setMediaRating);
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

async function clearRating(
  item: Plex.Metadata,
  onChanged: (item: Plex.Metadata) => void,
) {
  await act(async () =>
    root.render(<TitleRatingButton item={item} onChanged={onChanged} />),
  );
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Your rating: 4 stars"]',
  )!;
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 38, 38),
  );
  await act(async () => trigger.click());
  const clear = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Clear rating",
  )!;
  await act(async () => clear.click());
  return clear;
}

it("clears a rating only after Plex accepts the change, without mutating the item", async () => {
  const item = { ratingKey: "12", userRating: 8 } as Plex.Metadata;
  const onChanged = vi.fn();
  save.mockResolvedValue(true);
  await clearRating(item, onChanged);
  expect(onChanged).toHaveBeenCalledWith({ ...item, userRating: undefined });
  expect(save).toHaveBeenCalledWith(-1, "12");
  expect(item.userRating).toBe(8);
});

it.each([false, new Error("offline")])(
  "keeps the rating and offers retry after a failed save",
  async (result) => {
    const item = { ratingKey: "12", userRating: 8 } as Plex.Metadata;
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
