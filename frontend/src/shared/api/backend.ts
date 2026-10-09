import axios from "axios";

export type PlexHttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export function getBackendURL() {
  return "";
}

export function ProxiedRequest(
  url: string,
  method: PlexHttpMethod,
  headers?: Record<string, string>,
  data?: unknown,
  signal?: AbortSignal,
): Promise<{ status: number; data: unknown }> {
  return axios.post<unknown>(
    `${getBackendURL()}/proxy`,
    { url, method, headers, data },
    { signal, validateStatus: () => true },
  );
}
