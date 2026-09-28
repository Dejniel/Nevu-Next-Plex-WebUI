import { ProxiedRequest } from "./backend";

export type PlexHttpMethod = "GET" | "POST" | "PUT";

type PlexTransport = (
  url: string,
  method: PlexHttpMethod,
  headers?: Record<string, string>,
  data?: unknown,
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

  async request<T = any>(url: string, method: PlexHttpMethod, body?: unknown) {
    const response = await this.transport(
      url,
      method,
      {
        "X-Plex-Token": this.tokenProvider() ?? "",
        accept: "application/json",
      },
      body,
    );

    if (response.status === 200) return response.data as T;
    throw new PlexRequestError(response.status, response.data);
  }

  get<T = any>(url: string) {
    return this.request<T>(url, "GET");
  }

  post<T = any>(url: string, body?: unknown) {
    return this.request<T>(url, "POST", body);
  }

  put<T = any>(url: string, body: unknown) {
    return this.request<T>(url, "PUT", body);
  }
}
