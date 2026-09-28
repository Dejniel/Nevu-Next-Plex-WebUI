const assert = require("node:assert/strict");
const test = require("node:test");
const { parsePlexServerUrl } = require("../dist/plexServerUrl");

test("accepts only complete HTTP Plex origins without a path", () => {
  assert.equal(parsePlexServerUrl("http://plex:32400").hostname, "plex");
  assert.equal(parsePlexServerUrl("https://192.168.1.10:32400").protocol, "https:");
  assert.equal(parsePlexServerUrl("https://plex:32400/"), null);
  assert.equal(parsePlexServerUrl("https://plex:32400?token=secret"), null);
  assert.equal(parsePlexServerUrl("https://user:pass@plex:32400"), null);
  assert.equal(parsePlexServerUrl("not a URL"), null);
  assert.equal(parsePlexServerUrl(undefined), null);
});
