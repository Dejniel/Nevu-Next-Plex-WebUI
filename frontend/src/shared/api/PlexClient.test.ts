import { PlexClient, PlexRequestError } from "./PlexClient";

const transport = vi.fn();
const client = new PlexClient(() => "server-token", transport);

beforeEach(() => {
  transport.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

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

it("passes cancellation through POST requests as well as reads", async () => {
  transport.mockResolvedValue({ status: 201, data: {} });
  const signal = new AbortController().signal;
  await client.post("/playQueues", undefined, signal);
  expect(transport.mock.calls[0][4]).toBe(signal);
});

it.each([200, 201, 204])("accepts successful writes (%s), including empty DELETE responses", async (status) => {
  transport.mockResolvedValue({ status, data: "" });
  const signal = new AbortController().signal;
  await expect(client.delete("/playlists/20", signal)).resolves.toBe("");
  expect(transport.mock.calls[0].slice(0, 2)).toEqual(["/playlists/20", "DELETE"]);
  expect(transport.mock.calls[0][4]).toBe(signal);
});

it("does not send an already cancelled request", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(client.get("/identity", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(transport).not.toHaveBeenCalled();
});

it("rejects a late response when the transport ignores cancellation", async () => {
  const controller = new AbortController();
  transport.mockImplementation(async () => {
    controller.abort();
    return { status: 200, data: { ok: true } };
  });
  await expect(client.get("/identity", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});

it("sends binary uploads with authentication and cancellation outside the JSON transport", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  const file = new File(["subtitle"], "Movie.pl.srt");
  const signal = new AbortController().signal;
  await client.upload("/library/metadata/42/subtitles?format=srt", file, signal);
  expect(fetchMock).toHaveBeenCalledWith(
    "/dynproxy/library/metadata/42/subtitles?format=srt",
    {
      method: "POST",
      headers: {
        "X-Plex-Token": "server-token",
        Accept: "application/json",
        "Content-Type": "application/octet-stream",
      },
      body: file,
      signal,
    },
  );
  expect(transport).not.toHaveBeenCalled();
});

it("preserves the HTTP status for rejected uploads", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
  await expect(client.upload("/upload", new Blob(["file"]))).rejects.toMatchObject({ status: 403 });
});

it("does not turn an accepted upload into a failure while discarding the response body", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    body: { cancel: () => Promise.reject(new Error("Response closed")) },
  }));
  await expect(client.upload("/upload", new Blob(["file"]))).resolves.toBeUndefined();
});

it("does not upload after cancellation or accept a late response from an aborted upload", async () => {
  const controller = new AbortController();
  const fetchMock = vi.fn().mockImplementation(async () => {
    controller.abort();
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  await expect(client.upload("/upload", new Blob(["file"]), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  await expect(client.upload("/upload", new Blob(["file"]), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
