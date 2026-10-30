import { QueryClient } from "@tanstack/react-query";
import { PlexResponseError } from "shared/api/plexResponse";
import { readLibraryCatalog, readLibrarySections } from "./libraryCatalog";

const movie = { ratingKey: "8", title: "Movie", type: "movie", addedAt: -100 };
const response = (fields: Record<string, unknown>) => ({
  MediaContainer: fields,
});

it("separates navigation, type descriptions and media without inventing optional fields", () => {
  const schema = {
    size: 5,
    librarySectionID: 1,
    viewGroup: "movie",
    Directory: [
      { key: "all", title: "All" },
      { key: "genre", title: "Genre", secondary: 1 },
    ],
    Type: [
      {
        key: "/library/sections/1/all?type=1",
        title: "Movies",
        type: "movie",
        active: 0,
        Field: [{ key: "title", title: "Title", type: "string" }],
        Filter: [
          {
            key: "/genre",
            title: "Genre",
            type: "filter",
            filter: "genre",
            filterType: "string",
          },
        ],
        Sort: [
          {
            key: "titleSort",
            descKey: "titleSort:desc",
            title: "Title",
            default: "asc",
          },
        ],
      },
      { key: "/future", title: "Future type", type: "future" },
    ],
    FieldType: [
      { type: "string", Operator: [{ key: "=", title: "contains" }] },
    ],
    ignored: { notPartOfTheContract: true },
  };
  const catalog = readLibraryCatalog(response(schema));
  expect(catalog).toMatchObject({
    size: 5,
    librarySectionID: 1,
    FieldType: schema.FieldType,
    Metadata: [],
    Directory: [
      { key: "all", title: "All" },
      { key: "genre", secondary: true },
    ],
    Type: [
      {
        Field: schema.Type[0].Field,
        Filter: schema.Type[0].Filter,
        Sort: schema.Type[0].Sort,
      },
      { type: "future" },
    ],
  });
  expect(catalog).not.toHaveProperty("ignored");
  expect(catalog.Type?.[0].active).toBe(false);
  expect(catalog.Type?.[1]).not.toHaveProperty("active");
  expect(
    readLibraryCatalog(
      response({ Metadata: [movie, { ...movie, ratingKey: "9" }] }),
    ).Metadata,
  ).toMatchObject([{ ratingKey: "8", addedAt: -100 }, { ratingKey: "9" }]);
});

it.each([
  null,
  {},
  response({ Metadata: {} }),
  response({ Directory: null }),
  response({ size: 1 }),
  response({ size: 2, Metadata: [movie] }),
  response({ Metadata: [{ ...movie, title: 7 }] }),
  response({ Type: [{ key: "/all", title: "Movies" }] }),
  response({
    Type: [{ key: "/all", title: "Movies", type: "movie", active: "false" }],
  }),
  response({ FieldType: [{ type: "string", Operator: [{ title: "is" }] }] }),
  response({
    Type: [
      {
        key: "/all",
        title: "Movies",
        type: "movie",
        Field: [{ key: "title", title: "Title" }],
      },
    ],
  }),
  response({ Directory: [{ key: 42, title: "Genre" }] }),
  response({ offset: 2, totalSize: 2, Metadata: [movie] }),
])("rejects malformed catalogs before they reach consumers: %#", (value) => {
  expect(() => readLibraryCatalog(value)).toThrow(PlexResponseError);
});

it("retains the previous Query response when revalidation returns malformed data", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const queryKey = ["catalog"];
  const previous = await client.fetchQuery({
    queryKey,
    queryFn: async () => readLibraryCatalog(response({ Metadata: [movie] })),
  });
  await client.invalidateQueries({ queryKey });
  await expect(
    client.fetchQuery({
      queryKey,
      queryFn: async () => readLibraryCatalog(response({ size: 1 })),
    }),
  ).rejects.toThrow(PlexResponseError);
  expect(client.getQueryData(queryKey)).toBe(previous);
  client.clear();
});

it("requires stable library identities while leaving future types to capability filtering", () => {
  const section = {
    key: "1",
    title: "Library",
    uuid: "stable",
    type: "future",
    refreshing: true,
  };
  expect(
    readLibrarySections(response({ size: 1, Directory: [section] })),
  ).toEqual([{ key: "1", title: "Library", uuid: "stable", type: "future" }]);
  expect(readLibrarySections(response({ size: 0 }))).toEqual([]);
  for (const fields of [
    { ...section, uuid: undefined },
    { ...section, key: "" },
    { ...section, type: 1 },
  ])
    expect(() =>
      readLibrarySections(response({ Directory: [fields] })),
    ).toThrow(PlexResponseError);
  expect(() => readLibrarySections(response({ size: 1 }))).toThrow(
    PlexResponseError,
  );
});

it("distinguishes an explicit count-only read from a truncated nonempty directory", () => {
  const value = response({ size: 0, offset: 0, totalSize: 100 });
  expect(() => readLibraryCatalog(value, { offset: 0, size: 8 })).toThrow(
    PlexResponseError,
  );
  expect(readLibraryCatalog(value, { offset: 0, size: 0 })).toMatchObject({
    size: 0,
    totalSize: 100,
    Metadata: [],
  });
  expect(() =>
    readLibraryCatalog(response({ Metadata: [movie, movie] }), {
      offset: 0,
      size: 1,
    }),
  ).toThrow(PlexResponseError);
});
