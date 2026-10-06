import type Shaka from "shaka-player";
import { createStreamingPlayer, loadShaka } from "./shaka";
import type { VideoSource } from "./types";

const mocks = vi.hoisted(() => ({
  registerResponseFilter: vi.fn(),
  configure: vi.fn(),
}));
vi.mock("shaka-player", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof Shaka }>();
  return {
    default: {
      ...actual.default,
      polyfill: { installAll: vi.fn() },
      Player: class {
        static isBrowserSupported() {
          return true;
        }
        configure = mocks.configure;
        getNetworkingEngine() {
          return mocks;
        }
      },
    },
  };
});

const source: VideoSource = { id: "stream", url: "/stream.mpd", type: "dash" };
function box(type: string, payload: number[] = []) {
  const data = new Uint8Array(8 + payload.length);
  new DataView(data.buffer).setUint32(0, data.length);
  data.set(Array.from(type, (character) => character.charCodeAt(0)), 4);
  data.set(payload, 8);
  return data;
}
const join = (...boxes: Uint8Array[]) =>
  new Uint8Array(boxes.flatMap((data) => [...data]));
function responseWith(data: Uint8Array): Shaka.extern.Response {
  return {
    data,
    headers: {},
    uri: source.url,
    originalUri: source.url,
    originalRequest: {} as Shaka.extern.Request,
  };
}

it("leaves ordinary streams without a fragment response filter", async () => {
  await createStreamingPlayer(source);
  expect(mocks.registerResponseFilter).not.toHaveBeenCalled();
});

it("removes repeated initialization using Shaka's MP4 parser and preserves media bytes", async () => {
  const shaka = await loadShaka();
  await createStreamingPlayer({
    ...source,
    stripSegmentInitialization: true,
    seekPreRoll: 16,
  });
  expect(mocks.configure).toHaveBeenCalledWith(
    expect.objectContaining({
      streaming: expect.objectContaining({ inaccurateManifestTolerance: 16 }),
    }),
  );
  const filter = mocks.registerResponseFilter.mock
    .calls[0][0] as Shaka.extern.ResponseFilter;
  const media = join(box("styp"), box("sidx"), box("moof"), box("mdat", [1, 2, 3]));
  const fragment = join(box("ftyp"), box("moov", [9, 8, 7]), media);
  // Include a nonzero view offset, as a networking plugin may return a view.
  const backing = join(new Uint8Array([0]), fragment);
  const response = responseWith(backing.subarray(1));
  await filter(shaka.net.NetworkingEngine.RequestType.SEGMENT, response, {
    type: shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT,
  });
  expect(new Uint8Array(response.data as ArrayBuffer)).toEqual(media);
});

it("preserves initialization requests and fragments that already omit initialization", async () => {
  const shaka = await loadShaka();
  await createStreamingPlayer({ ...source, stripSegmentInitialization: true });
  const filter = mocks.registerResponseFilter.mock
    .calls[0][0] as Shaka.extern.ResponseFilter;
  const initialization = join(box("ftyp"), box("moov"));
  const response = responseWith(initialization);
  await filter(shaka.net.NetworkingEngine.RequestType.SEGMENT, response, {
    type: shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT,
  });
  expect(response.data).toBe(initialization);
  const fragment = join(box("moof"), box("mdat", [1]));
  response.data = fragment;
  await filter(shaka.net.NetworkingEngine.RequestType.SEGMENT, response, {
    type: shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT,
  });
  expect(response.data).toBe(fragment);
});
