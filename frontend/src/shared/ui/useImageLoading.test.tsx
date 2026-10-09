import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useImageLoading } from "./useImageLoading";

let root: Root, host: HTMLDivElement, state: ReturnType<typeof useImageLoading>;
function Image({ src }: { src: string | null }) {
  state = useImageLoading(src);
  return src && <img key={src} src={src} {...state.imageProps} />;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("resets on source changes and ignores a late result for the previous image", async () => {
  await act(async () => root.render(<Image src="/one" />));
  const previous = state.imageProps;
  await act(async () => previous.onLoad());
  expect(state.status).toBe("loaded");
  await act(async () => root.render(<Image src="/two" />));
  expect(state.status).toBe("loading");
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("load")),
  );
  await act(async () => previous.onError());
  expect(state.status).toBe("loaded");
});
it("recovers from a failed image when a different source is selected", async () => {
  await act(async () => root.render(<Image src="/one" />));
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  expect(state.status).toBe("missing");
  await act(async () => root.render(<Image src="/two" />));
  expect(state.status).toBe("loading");
});
it("recognizes a cached image when its load event has already happened", async () => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
    100,
  );
  await act(async () => root.render(<Image src="/cached" />));
  expect(state.status).toBe("loaded");
});
it("reports absent artwork without waiting for an image event", async () => {
  await act(async () => root.render(<Image src={null} />));
  expect(state.status).toBe("missing");
});
