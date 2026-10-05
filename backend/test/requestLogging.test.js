import assert from "node:assert/strict";
import test from "node:test";
import { safeRequestUrl, shouldLogRequest } from "../dist/requestLogging.js";

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
