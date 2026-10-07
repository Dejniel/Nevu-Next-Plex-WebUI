import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PlexHomeMemberEditor, PlexHomePinEditor } from "./PlexHomeDialogs";
import type { HomeDialogActions } from "./PlexHomeDialogs";
import type { PlexHomeMember } from "features/session/model";

let host: HTMLDivElement;
let root: Root;
const member: PlexHomeMember = {
  id: 2,
  title: "Child",
  protected: true,
  restricted: true,
  admin: false,
  guest: false,
  restrictionProfile: "teen",
};
let actions: HomeDialogActions;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  actions = {
    pending: false,
    error: null,
    change: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
    onSaved: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function input(label: string, value: string) {
  const element = Array.from(
    document.querySelectorAll<HTMLInputElement>("input"),
  ).find((element) => element.labels?.[0]?.textContent === label)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return element;
}
async function click(label: string) {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => button.textContent === label)!;
  await act(async () => button.click());
  return button;
}

it("renames a managed profile without rewriting its unchanged/custom restrictions", async () => {
  await act(async () =>
    root.render(
      <PlexHomeMemberEditor
        member={{ ...member, restrictionProfile: "custom" }}
        {...actions}
      />,
    ),
  );
  await input("Name", "Renamed child");
  await click("Save");
  expect(actions.change).toHaveBeenCalledTimes(1);
  expect(actions.change).toHaveBeenCalledWith({
    type: "edit",
    member: { ...member, restrictionProfile: "custom" },
    title: "Renamed child",
    restrictionProfile: "custom",
  });
  expect(actions.onSaved).toHaveBeenCalled();
});

it("does not report success when Plex rejects a changed name", async () => {
  vi.mocked(actions.change).mockResolvedValue(false);
  await act(async () =>
    root.render(<PlexHomeMemberEditor member={member} {...actions} />),
  );
  await input("Name", "Rejected name");
  await click("Save");
  expect(actions.onSaved).not.toHaveBeenCalled();
});

it("keeps PINs masked, requires four digits and clears them before the request completes", async () => {
  let finish!: (value: boolean) => void;
  vi.mocked(actions.change).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () =>
    root.render(<PlexHomePinEditor member={member} {...actions} />),
  );
  const field = await input("New four-digit PIN", "12");
  const save = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => button.textContent === "Save")!;
  expect(field.type).toBe("password");
  expect(save.disabled).toBe(true);
  await input("New four-digit PIN", "1234");
  await click("Save");
  expect(field.value).toBe("");
  expect(actions.change).toHaveBeenCalledWith({
    type: "pin",
    member,
    pin: "1234",
    currentPin: "",
  });
  await act(async () => finish(false));
  expect(actions.onSaved).not.toHaveBeenCalled();
});

it("requires the current PIN to remove a full account's protected PIN", async () => {
  const full = { ...member, restricted: false };
  await act(async () =>
    root.render(<PlexHomePinEditor member={full} {...actions} />),
  );
  const remove = await click("Remove PIN");
  expect(remove.disabled).toBe(true);
  expect(actions.change).not.toHaveBeenCalled();
  await input("Current PIN", "5678");
  await click("Remove PIN");
  expect(actions.change).toHaveBeenCalledWith({
    type: "pin",
    member: full,
    pin: "",
    currentPin: "5678",
  });
});
