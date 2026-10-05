import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import AppDialog from "./AppDialog";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "handles Escape, backdrop and close button with busy=%s",
  async (busy) => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <AppDialog open title="Save changes" busy={busy} onClose={onClose}>
          Form contents
        </AppDialog>,
      );
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    await act(async () => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(busy ? 0 : 1);

    const backdrop = dialog.parentElement!;
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      backdrop.click();
    });
    expect(onClose).toHaveBeenCalledTimes(busy ? 0 : 2);

    const close = dialog.querySelector<HTMLButtonElement>(
      '[aria-label="Close dialog"]',
    )!;
    expect(close.disabled).toBe(busy);
    await act(async () => close.click());
    expect(onClose).toHaveBeenCalledTimes(busy ? 0 : 3);
  },
);
