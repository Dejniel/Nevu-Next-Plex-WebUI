import { resolveTitleDetailsTab } from "./titleDetailsTabs";

it.each(["overview", "details", "reviews", "media"])(
  "resolves %s from the URL",
  (tab) => {
    expect(resolveTitleDetailsTab(tab, "movie")).toBe(tab);
  },
);
it("allows the episodes tab only for shows", () => {
  expect(resolveTitleDetailsTab("episodes", "show")).toBe("episodes");
  expect(resolveTitleDetailsTab("episodes", "movie")).toBe("overview");
});
it("falls back to overview for an absent or unknown tab", () => {
  expect(resolveTitleDetailsTab(null)).toBe("overview");
  expect(resolveTitleDetailsTab("unknown", "show")).toBe("overview");
});
