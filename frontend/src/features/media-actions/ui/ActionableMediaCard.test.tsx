import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import ActionableMediaCard from "./ActionableMediaCard";
import type { LibraryCardDto } from "@nevu/contracts";

const preview = vi.hoisted(() =>
  vi.fn((_item: unknown, _enabled: boolean) => ({
    extra: null,
    visible: false,
    onPlaying: vi.fn(),
    stop: vi.fn(),
  })),
);
vi.mock("entities/media/model/useMediaPreview", () => ({
  useMediaPreview: preview,
}));
let element: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  element = document.createElement("div");
  root = createRoot(element);
  preview.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it.each(["artist", "album", "track", "photoalbum", "photo"] as const)(
  "renders %s as catalog content without video actions or preview requests",
  async (type) => {
    const item: LibraryCardDto = {
      ratingKey: "10",
      type,
      title: "Catalog item",
      thumb: "/thumb",
      librarySectionID: 3,
      grandparentRatingKey: "20",
    };
    await act(async () =>
      root.render(
        <MemoryRouter>
          <ActionableMediaCard
            item={item}
            layout={type === "photo" ? "landscape" : "square"}
          />
        </MemoryRouter>,
      ),
    );
    expect(element.textContent).toContain("Catalog item");
    expect(element.querySelector("a")?.getAttribute("href")).toBe(type === "photo" ? undefined : `/browse/3/item/${type === "track" ? "20" : "10"}`);
    expect(element.querySelector("button")).toBeNull();
    const image = element.querySelector("img")!;
    const imageUrl = new URL(image.src);
    expect(imageUrl.searchParams.get("url")).toContain("/thumb");
    await act(async () =>
      image.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })),
    );
    expect(preview.mock.calls.every(([, enabled]) => enabled === false)).toBe(
      true,
    );
    expect(element.textContent).not.toContain("Watched");
  },
);

it("keeps movie details links and actions in the existing library context", async () => {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/browse/1?view=browse&type=movie"]}>
        <ActionableMediaCard
          item={{
            ratingKey: "10",
            type: "movie",
            guid: "local://10",
            title: "Film",
          }}
        />
      </MemoryRouter>,
    ),
  );
  expect(element.querySelector("a")?.getAttribute("href")).toBe(
    "/browse/1?view=browse&type=movie&mid=10",
  );
  expect(element.querySelector('[aria-label="Play Film"]')).not.toBeNull();
});
