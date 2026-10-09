import { getPlexTitleIdentity } from "./mediaIdentity";

it.each(["movie", "show"])(
  "reads a %s title identity independently of a local ratingKey",
  (type) => {
    expect(getPlexTitleIdentity(`plex://${type}/abc123`)).toEqual({
      type,
      id: "abc123",
      guid: `plex://${type}/abc123`,
    });
  },
);

it.each([
  undefined,
  null,
  42,
  "",
  "plex://movie/",
  "plex://episode/abc",
  "plex://show/a/b",
  "plex://movie/abc?token=secret",
  "plex://movie/abc#fragment",
  "plex://movie/a,b",
  "plex://movie/a b",
  "https://example.com/movie/123",
  "com.plexapp.agents.none://local",
])("rejects unsupported or ambiguous title identity %s", (guid) => {
  expect(getPlexTitleIdentity(guid)).toBeNull();
});
