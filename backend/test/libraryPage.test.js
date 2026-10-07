import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import {
  createLibraryPageRouter,
  InvalidLibraryPageError,
  projectLibraryPage,
  RequestLimiter,
  stableRandomOrder,
} from "../dist/libraryPage.js";

function card(id, title = `Movie ${id}`) {
  return {
    ratingKey: String(id),
    guid: `plex://movie/${id}`,
    title,
    type: "movie",
  };
}

const randomRequest = { sectionId: "1", type: "movie", sort: "random", seed: "stable", offset: "0", size: "64" };
test("a canonical metadata read updates later random pages without rebuilding or reshuffling 1300 items", async () => {
  const original = axios.get;
  const items = Array.from({ length: 1300 }, (_, id) => ({ ...card(id), librarySectionID: 1, updatedAt: 1 }));
  let pageReads = 0;
  let itemReads = 0;
  axios.get = async (url, config) => {
    if (url.endsWith("/metadata/42")) {
      itemReads++;
      return { data: { MediaContainer: { Metadata: [{ ...items[42], thumb: "fresh", updatedAt: 2 }] } } };
    }
    pageReads++;
    const offset = Number(config.params.get("X-Plex-Container-Start"));
    return { data: { MediaContainer: { offset, totalSize: items.length, Metadata: items.slice(offset, offset + 500) } } };
  };
  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex" });
    const first = await callRouter(router, randomRequest);
    assert.equal(pageReads, 3);
    const changed = await callRouter(router, { id: "42" }, "secret", "/synchronize", "post");
    assert.equal(changed.body.item.thumb, "fresh");
    const offset = stableRandomOrder(items, "stable").findIndex(item => item.ratingKey === "42");
    const later = await callRouter(router, { ...randomRequest, offset: String(offset), size: "1" });
    assert.equal(later.body.items[0].thumb, "fresh");
    assert.equal(later.body.generationId, first.body.generationId);
    const returned = await callRouter(router, randomRequest);
    assert.deepEqual(returned.body.items.map(item => item.ratingKey), first.body.items.map(item => item.ratingKey));
    assert.equal(pageReads, 3);
    assert.equal(itemReads, 1);
  } finally { axios.get = original; }
});

test("watched changes rebuild dependent random filters while another token retains its catalog", async () => {
  const original = axios.get;
  let watched = false;
  let reads = 0;
  const item = { ...card(42), librarySectionID: 1, viewCount: 0 };
  axios.get = async url => {
    if (url.endsWith("/metadata/42")) return { data: { MediaContainer: { Metadata: [{ ...item, viewCount: 1 }] } } };
    reads++;
    return { data: { MediaContainer: { totalSize: watched ? 0 : 1, Metadata: watched ? [] : [item] } } };
  };
  const filtered = { ...randomRequest, filterExpression: JSON.stringify({ kind: "clause", field: "unwatched", operator: "=", value: "1" }) };
  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex" });
    await callRouter(router, filtered); await callRouter(router, filtered, "other-profile-token");
    watched = true;
    await callRouter(router, { id: "42" }, "secret", "/synchronize", "post");
    assert.equal((await callRouter(router, filtered)).body.totalSize, 0);
    assert.equal((await callRouter(router, filtered, "other-profile-token")).body.totalSize, 1);
    assert.equal(reads, 3);
  } finally { axios.get = original; }
});

test("actor changes revalidate random membership even when the card projection is unchanged", async () => {
  const original = axios.get;
  let changed = false;
  let reads = 0;
  const item = { ...card(42), librarySectionID: 1 };
  axios.get = async url => {
    if (url.endsWith("/metadata/42")) return { data: { MediaContainer: {
      Metadata: [{ ...item, Role: [{ id: 2, tag: "New actor" }] }],
    } } };
    reads++;
    return { data: { MediaContainer: { totalSize: changed ? 0 : 1, Metadata: changed ? [] : [item] } } };
  };
  const filtered = { ...randomRequest, filterExpression: JSON.stringify({ kind: "clause", field: "actor", operator: "=", value: "1" }) };
  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex" });
    await callRouter(router, filtered);
    changed = true;
    await callRouter(router, { id: "42" }, "secret", "/synchronize", "post");
    assert.equal((await callRouter(router, filtered)).body.totalSize, 0);
    assert.equal(reads, 2);
  } finally { axios.get = original; }
});

test("an item absent from a filtered random catalog can enter it after synchronization", async () => {
  const original = axios.get;
  let added = false;
  let reads = 0;
  axios.get = async url => {
    if (url.endsWith("/metadata/42")) return { data: { MediaContainer: { Metadata: [{ ...card(42), librarySectionID: 1 }] } } };
    reads++;
    return { data: { MediaContainer: { totalSize: added ? 1 : 0, Metadata: added ? [card(42)] : [] } } };
  };
  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex" });
    await callRouter(router, randomRequest);
    added = true;
    await callRouter(router, { id: "42" }, "secret", "/synchronize", "post");
    assert.equal((await callRouter(router, randomRequest)).body.totalSize, 1);
    assert.equal(reads, 2);
  } finally { axios.get = original; }
});

test("an invalidated in-flight catalog cannot resurrect stale metadata or order entries", async () => {
  const original = axios.get;
  let finish;
  let reads = 0;
  axios.get = async () => {
    reads++;
    if (reads === 1) return new Promise(resolve => { finish = resolve; });
    return { data: { MediaContainer: { totalSize: 1, Metadata: [card(42, "fresh")] } } };
  };
  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex" });
    const old = callRouter(router, randomRequest);
    await new Promise(resolve => setImmediate(resolve));
    await callRouter(router, { sectionId: "1" }, "secret", "/catalog", "delete");
    await callRouter(router, randomRequest);
    finish({ data: { MediaContainer: { totalSize: 1, Metadata: [card(42, "stale")] } } });
    await old;
    const current = await callRouter(router, randomRequest);
    assert.equal(current.body.items[0].title, "fresh");
    assert.equal(reads, 2);
  } finally { axios.get = original; }
});

test("returns full canonical details only for an existing details-cache consumer", async () => {
  const original = axios.get;
  const metadata = { ...card(42), librarySectionID: 1, summary: "Full description", Children: { Metadata: [] } };
  let upstream;
  axios.get = async (_url, config) => { upstream = config; return { data: { MediaContainer: { Metadata: [metadata] } } }; };
  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex" });
    const cardOnly = await callRouter(router, { id: "42" }, "secret", "/synchronize", "post");
    assert.equal(cardOnly.body.metadata, undefined);
    assert.equal(upstream.params, undefined);
    const details = await callRouter(router, { id: "42", includeDetails: "true" }, "secret", "/synchronize", "post");
    assert.deepEqual(details.body.metadata, metadata);
    assert.equal(upstream.params.includeChildren, 1);
    assert.equal(upstream.params.includeExtras, 1);
  } finally { axios.get = original; }
});

async function callRouter(router, query, token = "secret", path = "/", method = "get") {
  const layer = router.stack.find((candidate) => candidate.route?.path === path && candidate.route.methods[method]);
  const result = { status: 200, body: null, headers: {} };
  await layer.route.stack[0].handle(
    { headers: { "x-plex-token": token }, query },
    {
      status(value) { result.status = value; return this; },
      set(name, value) { result.headers[name] = value; return this; },
      send(value) { result.body = value; return this; },
    },
  );
  return result;
}

test("projects library pages to the explicit card contract", () => {
  const result = projectLibraryPage({
    size: 1,
    totalSize: 900,
    offset: 0,
    unwanted: "container",
    Metadata: [{
      ...card(42, "Movie"),
      summary: "Not needed by a card",
      rating: 8.5,
      ratingImage: "imdb://image.rating",
      audienceRating: 9,
      audienceRatingImage: "rottentomatoes://image.rating.upright",
      Rating: [{ value: 8.5, type: "audience", image: "imdb://image.rating" }],
      Genre: [{ id: 1, tag: "Drama", extra: true }],
      Media: [{ width: 3840, height: 2160, videoResolution: "4k", Part: [{ file: "/secret" }] }],
    }],
  });

  assert.deepEqual(result, {
    offset: 0,
    size: 1,
    totalSize: 900,
    hasMore: true,
    items: [{
      ...card(42, "Movie"),
      rating: 8.5,
      ratingImage: "imdb://image.rating",
      audienceRating: 9,
      audienceRatingImage: "rottentomatoes://image.rating.upright",
      Genre: [{ id: 1, tag: "Drama" }],
      Media: [{ width: 3840, height: 2160, videoResolution: "4k" }],
    }],
  });
});

test("rejects malformed records instead of compacting positional pages", () => {
  assert.throws(
    () => projectLibraryPage({
      offset: 64,
      totalSize: 66,
      Metadata: [card(1), { ratingKey: "broken", type: "movie", title: "Broken" }],
    }, 64, 64),
    InvalidLibraryPageError,
  );
  assert.throws(
    () => projectLibraryPage({ offset: 0, totalSize: 2 }, 0, 64),
    InvalidLibraryPageError,
  );
});

test("loads a validated range and keeps the Plex token in a request header", async () => {
  const originalGet = axios.get;
  let upstream;
  axios.get = async (url, config) => {
    upstream = { url, config };
    return {
      data: {
        MediaContainer: {
          offset: 128,
          totalSize: 200,
          Metadata: [{ ...card(1, "First"), summary: "drop" }],
        },
      },
    };
  };

  try {
    const router = createLibraryPageRouter({ plexServer: "https://plex:32400" });
    const result = await callRouter(router, {
      sectionId: "1",
      type: "movie",
      sort: "updated:desc",
      filterExpression: JSON.stringify({
        kind: "group",
        mode: "or",
        children: [
          { kind: "clause", field: "genre", operator: "=", value: "4" },
          { kind: "clause", field: "genre", operator: "=", value: "5" },
          { kind: "clause", field: "unwatched", operator: "!=", value: "1" },
          { kind: "clause", field: "year", operator: ">=", value: "2020" },
        ],
      }),
      offset: "128",
      size: "64",
    });

    assert.equal(result.status, 200);
    assert.equal(result.headers["Cache-Control"], "private, no-store");
    assert.equal(upstream.url, "https://plex:32400/library/sections/1/all");
    assert.equal(upstream.config.headers["X-Plex-Token"], "secret");
    assert.equal(upstream.config.params.get("X-Plex-Container-Start"), "128");
    assert.equal(upstream.config.params.get("X-Plex-Container-Size"), "64");
    assert.equal(upstream.config.params.get("sort"), "updatedAt:desc");
    assert.equal(upstream.config.params.get("type"), "1");
    assert.deepEqual(upstream.config.params.getAll("genre"), ["4", "5"]);
    assert.equal(upstream.config.params.get("unwatched!"), "1");
    assert.equal(upstream.config.params.get("year>"), "2020");
    assert.match(upstream.config.params.get("excludeElements"), /Part/);
    assert.doesNotMatch(upstream.config.params.get("excludeFields"), /ratingImage|audienceRatingImage/);
    assert.deepEqual([...upstream.config.params.entries()].slice(6), [
      ["push", "1"],
      ["genre", "4"],
      ["or", "1"],
      ["genre", "5"],
      ["or", "1"],
      ["unwatched!", "1"],
      ["or", "1"],
      ["year>", "2020"],
      ["pop", "1"],
    ]);
    assert.deepEqual(result.body.items, [card(1, "First")]);
  } finally {
    axios.get = originalGet;
  }
});

test("rejects arbitrary Plex paths and invalid ranges", async () => {
  const router = createLibraryPageRouter({ plexServer: "http://plex:32400" });
  const result = await callRouter(router, {
    sectionId: "../identity",
    sort: "title:asc",
    offset: "0",
    size: "1000",
  });
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "Invalid library range request" });

  const arbitrarySource = await callRouter(router, {
    sectionId: "1",
    source: "../../identity",
    sort: "titleSort",
    offset: "0",
    size: "64",
  });
  assert.equal(arbitrarySource.status, 400);

  const injectedFilter = await callRouter(router, {
    sectionId: "1",
    sort: "titleSort",
    filterExpression: JSON.stringify({
      kind: "clause",
      field: "genre&X-Plex-Token",
      operator: "=",
      value: "other",
    }),
    offset: "0",
    size: "64",
  });
  assert.equal(injectedFilter.status, 400);

  const invalidValue = await callRouter(router, {
    sectionId: "1",
    sort: "titleSort",
    filterExpression: JSON.stringify({
      kind: "clause",
      field: "genre",
      operator: "=",
      value: "4\nX-Plex-Token=other",
    }),
    offset: "0",
    size: "64",
  });
  assert.equal(invalidValue.status, 400);

  const oversizedValue = await callRouter(router, {
    sectionId: "1",
    sort: "titleSort",
    filterExpression: JSON.stringify({
      kind: "clause",
      field: "genre",
      operator: "=",
      value: "x".repeat(257),
    }),
    offset: "0",
    size: "64",
  });
  assert.equal(oversizedValue.status, 400);

  const invalidGroup = await callRouter(router, {
    sectionId: "1",
    sort: "titleSort",
    filterExpression: JSON.stringify({ kind: "group", mode: "xor", children: [] }),
    offset: "0",
    size: "64",
  });
  assert.equal(invalidGroup.status, 400);
});

test("loads section on-deck through the same paginated contract", async () => {
  const originalGet = axios.get;
  let upstreamUrl;
  axios.get = async (url) => {
    upstreamUrl = url;
    return {
      data: {
        MediaContainer: {
          offset: 0,
          totalSize: 1,
          Metadata: [card(7, "Continue")],
        },
      },
    };
  };

  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex:32400" });
    const result = await callRouter(router, {
      sectionId: "2",
      source: "onDeck",
      sort: "lastViewedAt:desc",
      offset: "0",
      size: "64",
    });

    assert.equal(result.status, 200);
    assert.equal(upstreamUrl, "http://plex:32400/library/sections/2/onDeck");
    assert.equal(result.body.items[0].title, "Continue");
  } finally {
    axios.get = originalGet;
  }
});

test("serializes nested boolean filter groups in Plex order", async () => {
  const originalGet = axios.get;
  let upstream;
  axios.get = async (_url, config) => {
    upstream = config.params;
    return { data: { MediaContainer: { offset: 0, totalSize: 0 } } };
  };

  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex:32400" });
    const result = await callRouter(router, {
      sectionId: "1",
      type: "movie",
      sort: "titleSort",
      filterExpression: JSON.stringify({
        kind: "group",
        mode: "and",
        children: [{
          kind: "group",
          mode: "or",
          children: [
            { kind: "clause", field: "genre", operator: "=", value: "5" },
            { kind: "clause", field: "genre", operator: "=", value: "4" },
          ],
        }, {
          kind: "clause",
          field: "unwatched",
          operator: "=",
          value: "1",
        }],
      }),
      offset: "0",
      size: "64",
    });

    assert.equal(result.status, 200);
    assert.deepEqual([...upstream.entries()].slice(6), [
      ["push", "1"],
      ["unwatched", "1"],
      ["and", "1"],
      ["push", "1"],
      ["genre", "4"],
      ["or", "1"],
      ["genre", "5"],
      ["pop", "1"],
      ["pop", "1"],
    ]);
  } finally {
    axios.get = originalGet;
  }
});

test("rejects empty, oversized, and excessively deep filter groups", async () => {
  const router = createLibraryPageRouter({ plexServer: "http://plex:32400" });
  const base = { sectionId: "1", sort: "titleSort", offset: "0", size: "64" };
  const empty = await callRouter(router, {
    ...base,
    filterExpression: JSON.stringify({ kind: "group", mode: "and", children: [] }),
  });

  let tooDeep = { kind: "clause", field: "genre", operator: "=", value: "4" };
  for (let depth = 0; depth < 5; depth += 1)
    tooDeep = { kind: "group", mode: "and", children: [tooDeep] };
  const deep = await callRouter(router, {
    ...base,
    filterExpression: JSON.stringify(tooDeep),
  });
  const oversized = await callRouter(router, {
    ...base,
    filterExpression: JSON.stringify({
      kind: "group",
      mode: "or",
      children: Array.from({ length: 33 }, (_, index) => ({
        kind: "clause",
        field: "genre",
        operator: "=",
        value: String(index),
      })),
    }),
  });

  assert.equal(empty.status, 400);
  assert.equal(deep.status, 400);
  assert.equal(oversized.status, 400);
});

test("stable random order survives additions and removals", () => {
  const source = Array.from({ length: 30 }, (_, index) => card(index));
  const first = stableRandomOrder(source, "session-a");
  const second = stableRandomOrder(source, "session-a");
  const other = stableRandomOrder(source, "session-b");
  const withAddition = stableRandomOrder([...source, card(99)], "session-a")
    .filter((item) => item.ratingKey !== "99");
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, other);
  assert.deepEqual(withAddition, first);
  assert.deepEqual(source, Array.from({ length: 30 }, (_, index) => card(index)));
});

test("random ranges share one stable server snapshot", async () => {
  const originalGet = axios.get;
  let calls = 0;
  axios.get = async (_url, config) => {
    calls += 1;
    assert.equal(config.params.get("sort"), "titleSort");
    return {
      data: {
        MediaContainer: {
          offset: 0,
          totalSize: 4,
          Metadata: [card(1), card(2), card(3), card(4)],
        },
      },
    };
  };

  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex:32400" });
    const base = {
      sectionId: "1",
      sort: "random:desc",
      seed: "stable-session-seed",
      size: "2",
    };
    const first = await callRouter(router, { ...base, offset: "0" });
    const second = await callRouter(router, { ...base, offset: "2" });
    const expected = stableRandomOrder([card(1), card(2), card(3), card(4)], base.seed);

    assert.equal(calls, 1);
    assert.deepEqual([...first.body.items, ...second.body.items], expected);
    assert.equal(first.body.generationId, second.body.generationId);
  } finally {
    axios.get = originalGet;
  }
});

test("accepts Plex-declared sort expressions but rejects injected parameters", async () => {
  const originalGet = axios.get;
  let upstreamSort;
  axios.get = async (_url, config) => {
    upstreamSort = config.params.get("sort");
    return { data: { MediaContainer: { offset: 0, totalSize: 0 } } };
  };

  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex:32400" });
    const valid = await callRouter(router, {
      sectionId: "2",
      type: "episode",
      sort: "show.titleSort:desc,season.index:nullsLast,episode.index:nullsLast",
      offset: "0",
      size: "64",
    });
    assert.equal(valid.status, 200);
    assert.equal(
      upstreamSort,
      "show.titleSort:desc,season.index:nullsLast,episode.index:nullsLast",
    );

    const invalid = await callRouter(router, {
      sectionId: "2",
      sort: "titleSort:asc&X-Plex-Token=other",
      offset: "0",
      size: "64",
    });
    assert.equal(invalid.status, 400);
  } finally {
    axios.get = originalGet;
  }
});

test("invalidating a random catalog updates cards and versions membership changes", async () => {
  const originalGet = axios.get;
  let items = [card(1), card(2), card(3)];
  axios.get = async () => ({
    data: { MediaContainer: { offset: 0, totalSize: items.length, Metadata: items } },
  });

  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex:32400" });
    const query = {
      sectionId: "1",
      sort: "random:desc",
      seed: "persistent-seed",
      offset: "0",
      size: "64",
    };
    const before = await callRouter(router, query);
    items = items.map((item) => item.ratingKey === "2" ? { ...item, title: "Renamed" } : item);
    assert.equal((await callRouter(router, { sectionId: "1" }, "secret", "/catalog", "delete")).status, 204);
    const metadataRefresh = await callRouter(router, query);

    assert.equal(before.body.generationId, metadataRefresh.body.generationId);
    assert.equal(
      metadataRefresh.body.items.find((item) => item.ratingKey === "2").title,
      "Renamed",
    );

    items = [...items, card(4)];
    await callRouter(router, { sectionId: "1" }, "secret", "/catalog", "delete");
    const after = await callRouter(router, query);

    assert.notEqual(metadataRefresh.body.generationId, after.body.generationId);
    assert.deepEqual(
      after.body.items.filter((item) => item.ratingKey !== "4"),
      metadataRefresh.body.items,
    );
  } finally {
    axios.get = originalGet;
  }
});

test("builds a random catalog from source offsets rather than projected positions", async () => {
  const originalGet = axios.get;
  const source = Array.from({ length: 501 }, (_, index) => card(index));
  const starts = [];
  axios.get = async (_url, config) => {
    const start = Number(config.params.get("X-Plex-Container-Start"));
    const size = Number(config.params.get("X-Plex-Container-Size"));
    starts.push(start);
    return {
      data: {
        MediaContainer: {
          offset: start,
          totalSize: source.length,
          Metadata: source.slice(start, start + size),
        },
      },
    };
  };

  try {
    const router = createLibraryPageRouter({ plexServer: "http://plex:32400" });
    const result = await callRouter(router, {
      sectionId: "1",
      sort: "random:desc",
      seed: "large-catalog",
      offset: "480",
      size: "21",
    });
    assert.deepEqual(starts, [0, 500]);
    assert.equal(result.body.totalSize, 501);
    assert.equal(result.body.items.length, 21);
  } finally {
    axios.get = originalGet;
  }
});

test("request limiter never exceeds its configured concurrency", async () => {
  const limiter = new RequestLimiter(2);
  let active = 0;
  let peak = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const tasks = Array.from({ length: 5 }, () => limiter.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await barrier;
    active -= 1;
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(peak, 2);
  release();
  await Promise.all(tasks);
  assert.equal(active, 0);
});
