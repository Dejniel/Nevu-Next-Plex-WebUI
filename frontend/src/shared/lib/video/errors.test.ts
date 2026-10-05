import { inspectNativeVideoError, nativeVideoError, shakaVideoError } from "./errors";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([401, 403, 404, 500])(
  "retains HTTP %s from Shaka without exposing its URL or body",
  (httpStatus) => {
    const failure = shakaVideoError({
      category: 1,
      severity: 2,
      code: 1001,
      data: ["http://plex/file?token=private", httpStatus, "private response"],
    });
    expect(failure).toMatchObject({ kind: "network", httpStatus, code: 1001 });
    expect(failure?.message).not.toContain("private");
  },
);

it("distinguishes an unavailable native file from an unsupported codec", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  const signal = new AbortController().signal;
  const failure = await inspectNativeVideoError({ code: 4 } as MediaError, "/original.mp4", signal);
  expect(failure).toMatchObject({ kind: "network", httpStatus: 404 });
  expect(fetch).toHaveBeenCalledWith("/original.mp4", {
    method: "HEAD",
    signal: expect.any(AbortSignal),
  });
});

it("keeps the decoder error when the original file is available", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  expect(
    await inspectNativeVideoError(
      { code: 4 } as MediaError,
      "/original.mp4",
      new AbortController().signal,
    ),
  ).toMatchObject({ kind: "unsupported" });
});

it("does not probe known decoder failures or cross-origin sources", async () => {
  vi.stubGlobal("fetch", vi.fn());
  await inspectNativeVideoError(
    { code: 3 } as MediaError,
    "/original.mp4",
    new AbortController().signal,
  );
  await inspectNativeVideoError(
    { code: 4 } as MediaError,
    "https://cdn.example/file.mp4",
    new AbortController().signal,
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("bounds the status check so an unresponsive server cannot stall fallback", async () => {
  vi.useFakeTimers();
  const request = vi.fn(
    (_url, { signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
  );
  vi.stubGlobal("fetch", request);
  const failure = inspectNativeVideoError(
    { code: 4 } as MediaError,
    "/original.mp4",
    new AbortController().signal,
  );
  await vi.advanceTimersByTimeAsync(3000);
  expect(await failure).toMatchObject({ kind: "unsupported" });
  expect(request.mock.calls[0][1].signal.aborted).toBe(true);
});

it("treats cancellation and recoverable Shaka events as cleanup", () => {
  expect(nativeVideoError({ code: 1 } as MediaError)).toBeNull();
  expect(shakaVideoError({ code: 7000 })).toBeNull();
  expect(shakaVideoError({ code: 1002, severity: 1 })).toBeNull();
});
