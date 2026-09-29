import { queryBuilder } from "./query";

it("encodes Plex query names and values", () => {
  expect(queryBuilder({ "X-Plex-Token": "a&b", offset: 2 })).toBe(
    "X-Plex-Token=a%26b&offset=2",
  );
});
