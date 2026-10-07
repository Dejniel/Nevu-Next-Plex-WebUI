import { photoAspectRatio, photoMonth } from "./photos";

it("keeps portrait and landscape proportions and tolerates missing dimensions", () => {
  const photo = {
    ratingKey: "1",
    type: "photo" as const,
    title: "Photo",
    Media: [{ width: 1000, height: 2000 }],
  };
  expect(photoAspectRatio(photo)).toBe(0.5);
  expect(
    photoAspectRatio({ ...photo, Media: [{ width: 2000, height: 1000 }] }),
  ).toBe(2);
  expect(photoAspectRatio(undefined)).toBe(1.5);
});
it("uses the photo date for month groups, with an explicit undated group", () => {
  expect(
    photoMonth({
      ratingKey: "1",
      type: "photo",
      title: "P",
      originallyAvailableAt: "2026-10-01",
    }),
  ).toContain("2026");
  expect(photoMonth({ ratingKey: "1", type: "photo", title: "P" })).toBe(
    "Undated",
  );
});
