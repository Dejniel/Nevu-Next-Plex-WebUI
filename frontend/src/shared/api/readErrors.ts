import axios from "axios";

/** Manual recovery is broader than an automatic retry of the same read. */
export function isTransientReadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("retryable" in error && error.retryable === false) return false;
  const transport = axios.isAxiosError(error)
    ? error
    : "cause" in error && axios.isAxiosError(error.cause)
      ? error.cause
      : undefined;
  const status = "status" in error ? error.status : transport?.response?.status;
  if (typeof status === "number") return [408, 500, 502, 503, 504].includes(status);
  return Boolean(transport && ["ERR_NETWORK", "ECONNRESET", "ECONNABORTED", "ETIMEDOUT"].includes(transport.code ?? ""));
}
