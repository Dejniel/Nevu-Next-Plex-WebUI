import axios from "axios";
import { ProxiedRequest } from "./backend";

afterEach(() => vi.restoreAllMocks());

it("preserves connection errors instead of fabricating an HTTP 500 response", async () => {
  const failure = new axios.AxiosError("Network Error", "ERR_NETWORK");
  vi.spyOn(axios, "post").mockRejectedValue(failure);
  await expect(ProxiedRequest("/identity", "GET")).rejects.toBe(failure);
});

it("preserves request cancellation at the transport boundary", async () => {
  const cancellation = new axios.CanceledError();
  vi.spyOn(axios, "post").mockRejectedValue(cancellation);
  await expect(ProxiedRequest("/identity", "GET")).rejects.toBe(cancellation);
});
