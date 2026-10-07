import { canManageServer } from "./serverAccess";

it("allows server management only to an unrestricted profile with the Plex manage capability", () => {
  expect(canManageServer(true, true)).toBe(true);
  expect(canManageServer(true, false)).toBe(false);
  expect(canManageServer(false, true)).toBe(false);
  expect(canManageServer(false, false)).toBe(false);
});
