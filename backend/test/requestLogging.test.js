const assert = require("node:assert/strict");
const test = require("node:test");
const { safeRequestUrl, shouldLogRequest } = require("../dist/requestLogging");

test("redacts Plex tokens without hiding ordinary query parameters", () => {
  const result = safeRequestUrl("/image?width=640&X-Plex-Token=secret");
  assert.match(result, /^\/image\?/);
  assert.match(result, /width=640/);
  assert.doesNotMatch(result, /secret/);
});

test("omits noisy dynamic image proxy requests", () => {
  assert.equal(shouldLogRequest("/dynproxy/photo/:/transcode"), false);
  assert.equal(shouldLogRequest("/status"), true);
});
