import { plexProfileKey } from "./profileIdentity";

it("scopes profiles by both their owning account and Home identity", () => {
  expect(plexProfileKey({ id: 1 }, { id: 2 })).toBe("1:2");
  expect(plexProfileKey({ id: 3 }, { id: 2 })).toBe("3:2");
  expect(plexProfileKey({ id: 1 }, { id: 1 })).toBe("1:1");
});

it("does not invent an owner scope before authentication finishes", () => {
  expect(plexProfileKey(null, { id: 1 })).toBeNull();
  expect(plexProfileKey({ id: 1 }, null)).toBeNull();
});
