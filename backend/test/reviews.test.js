const assert = require("node:assert/strict");
const test = require("node:test");
const { createReviewsRouter } = require("../dist/reviews");

function database(overrides = {}) {
  return {
    nevuReviewsLocal: {
      findMany: async () => [],
      upsert: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
      ...overrides.nevuReviewsLocal,
    },
    nevuReviewsLocalUsers: {
      upsert: async () => ({}),
      ...overrides.nevuReviewsLocalUsers,
    },
  };
}

async function request(options, method, requestData) {
  const router = createReviewsRouter({
    checkPlexUser: async () => ({
      uuid: "user-1",
      username: "daniel",
      friendlyName: "Daniel",
      thumb: "avatar.jpg",
    }),
    nevuHubUrl: "https://hub.invalid/",
    ...options,
  });
  const layer = router.stack.find(
    (candidate) => candidate.route?.path === "/" && candidate.route.methods[method],
  );
  assert.ok(layer, `Missing ${method.toUpperCase()} review route`);

  const result = { status: 200, body: undefined, headers: {} };
  const response = {
    status(value) {
      result.status = value;
      return this;
    },
    send(value) {
      result.body = value;
      return this;
    },
    setHeader(name, value) {
      result.headers[name] = value;
      return this;
    },
  };
  await layer.route.stack[0].handle(
    {
      headers: { "x-plex-token": "token" },
      query: {},
      body: {},
      ...requestData,
    },
    response,
    () => {},
  );
  return result;
}

test("stores a rating-only local review without placeholder text", async () => {
  let saved;
  const prisma = database({
    nevuReviewsLocal: {
      upsert: async (input) => {
        saved = input;
        return {};
      },
    },
  });
  const response = await request(
    { prisma, globalReviewsEnabled: false },
    "post",
    {
      body: {
        itemID: "plex://movie/1",
        rating: 8,
        message: "",
        spoilers: false,
        visibility: "LOCAL",
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(saved.create.message, "");
  assert.equal(saved.create.rating, 8);
});

test("returns local reviews when Nevu Community is unavailable", async () => {
  const localReview = {
    itemID: "plex://movie/1",
    userID: "user-1",
    created_at: new Date("2026-01-01T00:00:00Z"),
    rating: 8,
    message: "Local",
    spoilers: false,
    user: { id: "user-1", username: "Daniel", avatar: "" },
  };
  const response = await request(
    {
      prisma: database({ nevuReviewsLocal: { findMany: async () => [localReview] } }),
      globalReviewsEnabled: true,
      hubClient: { post: async () => { throw new Error("offline"); } },
    },
    "get",
    { query: { itemID: "plex://movie/1" } },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [{
    ...localReview,
    visibility: "LOCAL",
  }]);
});

test("returns a response instead of hanging on a global delete error", async () => {
  const response = await request(
    {
      prisma: database(),
      globalReviewsEnabled: true,
      hubClient: { post: async () => ({ data: { error: "Delete rejected" } }) },
    },
    "delete",
    { query: { itemID: "plex://movie/1", visibility: "GLOBAL" } },
  );

  assert.equal(response.status, 502);
  assert.deepEqual(response.body, { error: "Delete rejected" });
});

test("local delete is idempotent and visibility is required", async () => {
  let deleted = false;
  const prisma = database({
    nevuReviewsLocal: {
      deleteMany: async () => {
        deleted = true;
        return { count: 0 };
      },
    },
  });
  const deletedResponse = await request(
    { prisma, globalReviewsEnabled: false },
    "delete",
    { query: { itemID: "plex://movie/1", visibility: "LOCAL" } },
  );
  const invalidResponse = await request(
    { prisma, globalReviewsEnabled: false },
    "delete",
    { query: { itemID: "plex://movie/1" } },
  );

  assert.equal(deletedResponse.status, 200);
  assert.equal(deleted, true);
  assert.equal(invalidResponse.status, 400);
});
