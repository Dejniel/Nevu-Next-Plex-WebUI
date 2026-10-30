import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { MediaMetadata } from "entities/media/model";
import TitleOverview from "./TitleOverview";

const shelf = vi.fn(
  ({ title, data }: { title: string; data: MediaMetadata[] }) =>
    data.length ? (
      <section aria-label={title}>
        {data.map((item) => (
          <span key={item.ratingKey}>{item.title}</span>
        ))}
      </section>
    ) : null,
);
vi.mock("features/media-actions/public", () => ({
  MediaShelf: (props: Parameters<typeof shelf>[0]) => shelf(props),
}));

it("passes all distinct related titles to the shared shelf, excluding the current title", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const movie = (id: number): MediaMetadata => ({
    ratingKey: String(id),
    type: "movie",
    title: `Movie ${id}`,
    guid: `local://${id}`,
  });
  const related = Array.from({ length: 20 }, (_, index) => movie(index + 1));
  const original = [movie(0), ...related];
  Object.freeze(original);
  const value: MediaMetadata = {
    ...movie(0),
    Related: { Hub: [{ Metadata: original }, { Metadata: [related[0]] }] },
  };
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TitleOverview
            data={value}
            trailer={null}
            onShowDetails={vi.fn()}
            onShowReviews={vi.fn()}
          />
        </MemoryRouter>,
      ),
    );
    expect(
      shelf.mock.calls.at(-1)![0].data.map((item) => item.ratingKey),
    ).toEqual(related.map((item) => item.ratingKey));
    expect(value.Related!.Hub![0].Metadata).toHaveLength(21);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
