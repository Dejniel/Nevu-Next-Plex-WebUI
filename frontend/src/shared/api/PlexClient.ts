import { getBackendURL, ProxiedRequest, type PlexHttpMethod } from "./backend";

type PlexTransport = (
  url: string,
  method: PlexHttpMethod,
  headers?: Record<string, string>,
  data?: unknown,
  signal?: AbortSignal,
) => Promise<{ status: number; data: unknown }>;

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

  async request<T = unknown>(
    url: string,
    method: PlexHttpMethod,
    body?: unknown,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
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
    signal?.throwIfAborted();

    if (response.status >= 200 && response.status < 300)
      return response.data as T;
    throw new PlexRequestError(response.status, response.data);
  }

  get<T = unknown>(url: string, signal?: AbortSignal) {
    return this.request<T>(url, "GET", undefined, signal);
  }

  post<T = unknown>(url: string, body?: unknown, signal?: AbortSignal) {
    return this.request<T>(url, "POST", body, signal);
  }

  put<T = void>(url: string, body?: unknown, signal?: AbortSignal) {
    return this.request<T>(url, "PUT", body, signal);
  }

  delete<T = void>(url: string, signal?: AbortSignal) {
    return this.request<T>(url, "DELETE", undefined, signal);
  }

  /** Native Plex uploads take the file itself, not JSON or multipart data. */
  async upload(url: string, file: Blob, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const response = await fetch(`${getBackendURL()}/dynproxy${url}`, {
      method: "POST",
      headers: {
        "X-Plex-Token": this.tokenProvider() ?? "",
        Accept: "application/json",
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
      signal,
    });
    // The status acknowledges the write. Discarding its response body must not
    // turn an accepted upload into a repeatable failed upload.
    await response.body?.cancel().catch(() => undefined);
    signal?.throwIfAborted();
    if (!response.ok) throw new PlexRequestError(response.status, null);
  }
}
