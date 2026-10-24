import { act } from "react";
import { createRoot } from "react-dom/client";
import SubtitleUploadAction from "./SubtitleUploadAction";

it("shows upload errors, allows retrying the same file and waits for selection to complete", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  const onUpload = vi
    .fn()
    .mockRejectedValueOnce(
      new Error("This Plex profile cannot upload subtitles."),
    );
  try {
    await act(async () =>
      root.render(
        <SubtitleUploadAction disabled={false} onUpload={onUpload} />,
      ),
    );
    const input = host.querySelector("input")!;
    const file = new File(["subtitle"], "movie.srt");
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () =>
      input.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "cannot upload",
    );
    expect(host.querySelector("button")?.disabled).toBe(false);
    let finish!: () => void;
    onUpload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () =>
      input.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(onUpload).toHaveBeenNthCalledWith(2, file);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(input.value).toBe("");
    expect(host.querySelector("button")?.disabled).toBe(true);
    expect(host.textContent).toContain("Uploading subtitles");
    await act(async () => finish());
    expect(host.querySelector("button")?.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});
