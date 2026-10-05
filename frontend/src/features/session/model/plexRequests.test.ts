import type { MockedFunction } from "vitest";
import { ProxiedRequest } from "shared/api/backend";
import {
  authedGet,
  authedGetStrict,
  PlexRequestError,
} from "./plexRequests";

vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));

const request = ProxiedRequest as MockedFunction<typeof ProxiedRequest>;

beforeEach(() => {
  request.mockReset();
});

it("returns successful Plex responses from strict authenticated requests", async () => {
  request.mockResolvedValue({ status: 200, data: { ok: true } } as never);

  await expect(authedGetStrict("/identity")).resolves.toEqual({ ok: true });
});

it("preserves the status when a strict authenticated request fails", async () => {
  request.mockResolvedValue({ status: 503, data: "unavailable" } as never);

  await expect(authedGetStrict("/identity")).rejects.toEqual(
    expect.objectContaining<Partial<PlexRequestError>>({
      name: "PlexRequestError",
      status: 503,
      response: "unavailable",
    }),
  );
});

it("keeps the legacy nullable behavior for existing callers", async () => {
  request.mockResolvedValue({ status: 500, data: "failed" } as never);

  await expect(authedGet("/identity")).resolves.toBeNull();
});
