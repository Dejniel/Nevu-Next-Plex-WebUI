import { AxiosError, CanceledError } from "axios";
import { isTransientReadError } from "./readErrors";

it.each([408, 500, 502, 503, 504])("retries a transient HTTP read failure (%s)", status => {
  expect(isTransientReadError(Object.assign(new Error("HTTP failure"), { status }))).toBe(true);
});

it.each([400, 401, 403, 404, 429, 501, 505])("does not retry permanent or rate-limited HTTP failures (%s)", status => {
  expect(isTransientReadError(Object.assign(new Error("HTTP failure"), { status }))).toBe(false);
});

it("preserves non-retryable response validation and programmer failures", () => {
  expect(isTransientReadError(Object.assign(new Error("Malformed response"), { status: 502, retryable: false }))).toBe(false);
  expect(isTransientReadError(new TypeError("Invalid page"))).toBe(false);
  expect(isTransientReadError(Object.assign(new Error("Changed order"), { retryable: true }))).toBe(false);
});

it("recognizes network failures through an API error cause without retrying cancellation", () => {
  const network = new AxiosError("Disconnected", "ERR_NETWORK");
  expect(isTransientReadError(network)).toBe(true);
  expect(isTransientReadError(new Error("Unable to load", { cause: network }))).toBe(true);
  expect(isTransientReadError(new CanceledError())).toBe(false);
  expect(isTransientReadError(new DOMException("Cancelled", "AbortError"))).toBe(false);
});
