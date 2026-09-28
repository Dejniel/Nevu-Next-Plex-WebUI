import {
  getDiscoverID,
  mergeTitleExtras,
  selectPrimaryTrailer,
  withoutExtra,
} from "./titleExtras";

function extra(
  title: string,
  duration: number,
  key: string,
  extraType = 1,
): Plex.Metadata {
  return { title, duration, key, ratingKey: key, extraType } as Plex.Metadata;
}

describe("Plex Discover extras", () => {
  it("extracts the Plex Discover id", () => {
    expect(
      getDiscoverID({ guid: "plex://movie/5d7769cefb0d55001f530acd" } as Plex.Metadata),
    ).toBe("5d7769cefb0d55001f530acd");
  });

  it("merges local and Discover extras without duplicating media", () => {
    const localTrailer = extra("Official Trailer", 120000, "/local/trailer");
    const discoverDuplicate = extra(
      "Official Trailer",
      120000,
      "/discover/trailer",
    );
    const featurette = extra("Behind the scenes", 60000, "/discover/featurette", 5);

    const merged = mergeTitleExtras(
      [localTrailer],
      [discoverDuplicate, featurette],
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ source: "local", metadata: localTrailer });
  });

  it("selects one trailer and excludes it from remaining extras", () => {
    const trailer = extra("Trailer", 120000, "/trailer");
    const scene = extra("Scene", 30000, "/scene", 6);
    const merged = mergeTitleExtras([], [trailer, scene]);
    const primary = selectPrimaryTrailer(merged);

    expect(primary?.metadata.title).toBe("Trailer");
    expect(withoutExtra(merged, primary).map((item) => item.metadata.title)).toEqual([
      "Scene",
    ]);
  });
});
