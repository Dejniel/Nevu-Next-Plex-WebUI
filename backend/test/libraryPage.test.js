const assert = require("node:assert/strict");
const test = require("node:test");
const axios = require("axios");
const {
  createLibraryPageRouter,
  projectLibraryPage,
  RequestLimiter,
  seededShuffle,
} = require("../dist/libraryPage");

function card(id, title = `Movie ${id}`) {
  return {
    ratingKey: String(id),
    guid: `plex://movie/${id}`,
    title,
    type: "movie",
  };
}

async function callRouter(router, query, token = "secret") {
  const layer = router.stack.find((candidate) => candidate.route?.path === "/");
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
    viewGroup: "movie",
    unwanted: "container",
    Metadata: [{
      ...card(42, "Movie"),
      summary: "Not needed by a card",
      Genre: [{ id: 1, tag: "Drama", extra: true }],
      Media: [{ width: 3840, height: 2160, videoResolution: "4k", Part: [{ file: "/secret" }] }],
    }],
  });

  assert.deepEqual(result, {
    offset: 0,
    size: 1,
    totalSize: 900,
    hasMore: true,
    viewGroup: "movie",
    items: [{
      ...card(42, "Movie"),
      Genre: [{ id: 1, tag: "Drama" }],
      Media: [{ width: 3840, height: 2160, videoResolution: "4k" }],
    }],
  });
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
      filter: "all",
      type: "movie",
      sort: "updated:desc",
      offset: "128",
      size: "64",
    });

    assert.equal(result.status, 200);
    assert.equal(result.headers["Cache-Control"], "private, no-store");
    assert.equal(upstream.url, "https://plex:32400/library/sections/1/all");
    assert.equal(upstream.config.headers["X-Plex-Token"], "secret");
    assert.equal(upstream.config.params["X-Plex-Container-Start"], 128);
    assert.equal(upstream.config.params["X-Plex-Container-Size"], 64);
    assert.equal(upstream.config.params.sort, "updatedAt:desc");
    assert.equal(upstream.config.params.type, 1);
    assert.match(upstream.config.params.excludeElements, /Part/);
    assert.deepEqual(result.body.items, [card(1, "First")]);
  } finally {
    axios.get = originalGet;
  }
});

test("rejects arbitrary Plex paths and invalid ranges", async () => {
  const router = createLibraryPageRouter({ plexServer: "http://plex:32400" });
  const result = await callRouter(router, {
    sectionId: "../identity",
    filter: "all",
    sort: "title:asc",
    offset: "0",
    size: "1000",
  });
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "Invalid library range request" });
});

test("seeded shuffle is repeatable without changing its input", () => {
  const source = Array.from({ length: 30 }, (_, index) => index);
  const first = seededShuffle(source, "session-a");
  const second = seededShuffle(source, "session-a");
  const other = seededShuffle(source, "session-b");
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, other);
  assert.deepEqual(source, Array.from({ length: 30 }, (_, index) => index));
});

test("random ranges share one stable server snapshot", async () => {
  const originalGet = axios.get;
  let calls = 0;
  axios.get = async (_url, config) => {
    calls += 1;
    assert.equal(config.params.sort, "title:asc");
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
      filter: "all",
      sort: "random:desc",
      seed: "stable-session-seed",
      size: "2",
    };
    const first = await callRouter(router, { ...base, offset: "0" });
    const second = await callRouter(router, { ...base, offset: "2" });
    const expected = seededShuffle([card(1), card(2), card(3), card(4)], base.seed);

    assert.equal(calls, 1);
    assert.deepEqual([...first.body.items, ...second.body.items], expected);
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
