import axios from "axios";

export function getBackendURL() {
  return "";
}

export function ProxiedRequest(
  url: string,
  method: "GET" | "POST" | "PUT",
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
