import { ProxiedRequest, type PlexHttpMethod } from "./backend";

type PlexTransport = (
  url: string,
  method: PlexHttpMethod,
  headers?: Record<string, string>,
  data?: unknown,
  signal?: AbortSignal,
) => Promise<{ status: number; data: any }>;

export class PlexRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly response: unknown,
  ) {
    super(`Plex request failed with status ${status}`);
    this.name = "PlexRequestError";
  }
}

export class PlexClient {
  constructor(
    private readonly tokenProvider: () => string | null,
    private readonly transport: PlexTransport = ProxiedRequest,
  ) {}

  async request<T = any>(
    url: string,
    method: PlexHttpMethod,
    body?: unknown,
    signal?: AbortSignal,
  ) {
    const response = await this.transport(
      url,
      method,
      {
        "X-Plex-Token": this.tokenProvider() ?? "",
        accept: "application/json",
      },
      body,
      signal,
    );

    if (response.status >= 200 && response.status < 300)
      return response.data as T;
    throw new PlexRequestError(response.status, response.data);
  }

  get<T = any>(url: string, signal?: AbortSignal) {
    return this.request<T>(url, "GET", undefined, signal);
  }

  post<T = any>(url: string, body?: unknown, signal?: AbortSignal) {
    return this.request<T>(url, "POST", body, signal);
  }

  put<T = any>(url: string, body?: unknown, signal?: AbortSignal) {
    return this.request<T>(url, "PUT", body, signal);
  }

  delete<T = void>(url: string, signal?: AbortSignal) {
    return this.request<T>(url, "DELETE", undefined, signal);
  }
}
