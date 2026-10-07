import axios from "axios";

export type PlexHttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export function getBackendURL() {
  return "";
}

export function ProxiedRequest(
  url: string,
  method: PlexHttpMethod,
  headers?: Record<string, string>,
  data?: any,
  signal?: AbortSignal,
) {
  return axios
    .post(
      `${getBackendURL()}/proxy`,
      { url, method, headers, data },
      { signal },
    )
    .catch((err) => {
      if (axios.isCancel(err)) throw err;
      return {
        status: err.response?.status || 500,
        data: err.response?.data || "Internal server error",
      };
    });
}
