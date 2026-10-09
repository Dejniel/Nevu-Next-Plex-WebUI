import { readArtworkChoices, readMetadataCast } from "./metadataResponses";

it("reads native artwork keys and explicit Plex flags while ignoring unrelated metadata fields", () => {
  expect(
    readArtworkChoices({
      MediaContainer: {
        Metadata: [
          {
            ratingKey: "metadata://one",
            key: "/preview/one",
            selected: 1,
            title: "Unused",
          },
          {
            ratingKey: "metadata://two",
            key: "/preview/two",
            thumb: "/thumb/two",
            selected: 0,
            provider: "local",
          },
          {
            ratingKey: "metadata://three",
            thumb: "/thumb/three",
            selected: true,
          },
        ],
      },
    }),
  ).toEqual([
    { url: "metadata://one", preview: "/preview/one", selected: true },
    {
      url: "metadata://two",
      preview: "/thumb/two",
      selected: false,
      provider: "local",
    },
    { url: "metadata://three", preview: "/thumb/three", selected: true },
  ]);
  expect(readArtworkChoices({ MediaContainer: {} })).toEqual([]);
});

it.each([
  {},
  { MediaContainer: [] },
  { MediaContainer: { Metadata: {} } },
  { MediaContainer: { Metadata: [null] } },
  { MediaContainer: { Metadata: [{ ratingKey: "one" }] } },
  { MediaContainer: { Metadata: [{ ratingKey: 1, thumb: "/preview" }] } },
  {
    MediaContainer: {
      Metadata: [{ ratingKey: "one", thumb: [], key: "/preview" }],
    },
  },
  {
    MediaContainer: {
      Metadata: [{ ratingKey: "one", thumb: "/preview", selected: "false" }],
    },
  },
  {
    MediaContainer: {
      Metadata: [{ ratingKey: "one", thumb: "/preview", provider: {} }],
    },
  },
])(
  "rejects malformed choices instead of silently hiding artwork (%j)",
  (response) => {
    expect(() => readArtworkChoices(response)).toThrow(
      "invalid artwork choices",
    );
  },
);

it("reads only the requested item's current cast and permits actors without character names", () => {
  expect(
    readMetadataCast(
      {
        MediaContainer: {
          Metadata: [
            {
              ratingKey: "42",
              title: "Unused",
              Role: [
                { tag: "Actor", role: "Character", thumb: "/actor" },
                { tag: "Other actor" },
              ],
            },
          ],
        },
      },
      "42",
    ),
  ).toEqual({
    ratingKey: "42",
    Role: [{ tag: "Actor", role: "Character" }, { tag: "Other actor" }],
  });
  expect(
    readMetadataCast(
      { MediaContainer: { Metadata: [{ ratingKey: "42" }] } },
      "42",
    ),
  ).toEqual({ ratingKey: "42", Role: [] });
});

it.each([
  {},
  { MediaContainer: { Metadata: [] } },
  { MediaContainer: { Metadata: [{ ratingKey: "other" }] } },
  { MediaContainer: { Metadata: [{ ratingKey: "42", Role: {} }] } },
  { MediaContainer: { Metadata: [{ ratingKey: "42", Role: [null] }] } },
  { MediaContainer: { Metadata: [{ ratingKey: "42", Role: [{ tag: {} }] }] } },
  {
    MediaContainer: {
      Metadata: [{ ratingKey: "42", Role: [{ tag: "Actor", role: [] }] }],
    },
  },
])("rejects an incomplete cast snapshot (%j)", (response) => {
  expect(() => readMetadataCast(response, "42")).toThrow(
    "invalid current cast information",
  );
});
