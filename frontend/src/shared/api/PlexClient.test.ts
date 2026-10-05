import { PlexClient, PlexRequestError } from "./PlexClient";

const transport = vi.fn();
const client = new PlexClient(() => "server-token", transport);

beforeEach(() => {
  transport.mockReset();
});

it("adds Plex authentication headers to requests", async () => {
  transport.mockResolvedValue({ status: 200, data: { ok: true } });

  await expect(client.get("/identity")).resolves.toEqual({ ok: true });
  expect(transport).toHaveBeenCalledWith(
    "/identity",
    "GET",
    { "X-Plex-Token": "server-token", accept: "application/json" },
    undefined,
    undefined,
  );
});

it("reports non-successful Plex responses with their status", async () => {
  transport.mockResolvedValue({ status: 503, data: "unavailable" });

  await expect(client.get("/identity")).rejects.toEqual(
    expect.objectContaining<Partial<PlexRequestError>>({
      status: 503,
      response: "unavailable",
    }),
  );
});

it("passes request cancellation through to the HTTP transport", async () => {
  transport.mockResolvedValue({ status: 200, data: {} });
  const controller = new AbortController();
  await client.get("/library/all", controller.signal);
  expect(transport.mock.calls[0][4]).toBe(controller.signal);
});
