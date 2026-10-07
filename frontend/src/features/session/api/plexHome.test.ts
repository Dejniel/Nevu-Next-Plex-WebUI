import axios from "axios";
import {
  changePlexHome,
  getPlexHomeMembers,
  getPlexHomeOverview,
} from "./plexHome";
import type { PlexHomeOverview, PlexHomeMember } from "../model/plexHome";
import { homeMemberActions, homeProfiles } from "../model/plexHome";

vi.mock("axios");
const cloud = vi.mocked(axios);
const owner: PlexHomeMember = {
  id: 1,
  title: "Owner",
  admin: true,
  protected: true,
  restricted: false,
  guest: false,
  restrictionProfile: "unrestricted",
};
const managed: PlexHomeMember = {
  ...owner,
  id: 2,
  title: "Kids",
  admin: false,
  restricted: true,
};
const regular: PlexHomeMember = {
  ...owner,
  id: 3,
  title: "Account",
  admin: false,
};
const home: PlexHomeOverview = {
  members: [owner, managed, regular],
  invites: [],
  canManage: true,
  canInvite: true,
  maxSize: 15,
  guestEnabled: false,
};
const session = { activeId: 1, token: "active-account-token" };

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  cloud.post.mockResolvedValue({ data: {} });
  cloud.request.mockResolvedValue({ data: {} });
  cloud.delete.mockResolvedValue({ data: {} });
  cloud.isAxiosError.mockImplementation((error): error is any =>
    Boolean(error && typeof error === "object" && "isAxiosError" in error),
  );
});

it("normalizes the native Home list without converting numeric names or exposing extra data", async () => {
  cloud.get.mockResolvedValue({
    data: '<MediaContainer size="2"><User id="1" title="007" admin="1" guest="0" restricted="0" protected="1" authenticationToken="secret" pin="1234"/><User id="2" title="Kids" restricted="1" restrictionProfile="little_kid" /></MediaContainer>',
  });
  const members = await getPlexHomeMembers(session.token);
  expect(members[0]).toMatchObject({
    id: 1,
    title: "007",
    admin: true,
    protected: true,
    guest: false,
  });
  expect(members[1]).toMatchObject({
    restricted: true,
    restrictionProfile: "little_kid",
    admin: false,
  });
  expect(JSON.stringify(members)).not.toMatch(
    /secret|1234|authenticationToken/,
  );
});

it("distinguishes the account used to log in from the actual Home administrator", () => {
  expect(homeProfiles(home.members, 3).map((member) => member.isOwner)).toEqual(
    [false, false, true],
  );
  expect(homeProfiles(home.members, 3)[0]).not.toHaveProperty("admin");
});

it.each(["<MediaContainer />", { MediaContainer: {} }])(
  "accepts an empty native Home collection",
  async (data) => {
    cloud.get.mockResolvedValue({ data });
    expect(await getPlexHomeMembers(session.token)).toEqual([]);
  },
);

it("rejects a malformed Home collection instead of reporting an empty household", async () => {
  cloud.get.mockResolvedValue({ data: { error: "failed" } });
  await expect(getPlexHomeMembers(session.token)).rejects.toThrow(
    "invalid Home response",
  );
});

it.each([
  [owner, 1, true, { edit: false, pin: true, remove: false, leave: false }],
  [managed, 1, true, { edit: true, pin: true, remove: true, leave: false }],
  [regular, 1, true, { edit: false, pin: false, remove: true, leave: false }],
  [regular, 3, false, { edit: false, pin: true, remove: true, leave: true }],
  [managed, 2, false, { edit: false, pin: false, remove: false, leave: false }],
  [
    { ...managed, guest: true },
    1,
    true,
    { edit: false, pin: false, remove: false, leave: false },
  ],
] as const)(
  "applies native permissions for %o",
  (member, activeId, canManage, expected) => {
    expect(homeMemberActions(member, activeId, canManage)).toEqual(expected);
  },
);

function overviewResponses(activeId: number, subscription = true) {
  cloud.get.mockImplementation(async (url) => {
    if (String(url).endsWith("/api/home/users"))
      return { data: { MediaContainer: { User: home.members } } };
    if (String(url).endsWith("/api/v2/user"))
      return {
        data: {
          id: activeId,
          restricted: activeId === 2,
          homeAdmin: true,
          maxHomeSize: 12,
          authToken: "private",
          pin: "private",
        },
      };
    if (String(url).endsWith("/api/v2/home"))
      return { data: { subscription, guestEnabled: false } };
    return {
      data: '<MediaContainer><Invite id="friend" home="0"/><Invite id="invite-id" home="1" friendlyName="Home friend" /></MediaContainer>',
    };
  });
}

it("reads capacity and invitations from Plex and returns no credentials", async () => {
  overviewResponses(1);
  const result = await getPlexHomeOverview(session);
  expect(result).toMatchObject({
    canManage: true,
    canInvite: true,
    maxSize: 12,
  });
  expect(result.invites).toHaveLength(2);
  expect(result.invites[0]).toEqual({
    id: "invite-id",
    title: "Home friend",
    incoming: false,
  });
  expect(JSON.stringify(result)).not.toContain("private");
});

it("does not grant Home administration from account or server owner flags", async () => {
  overviewResponses(3, false);
  expect(await getPlexHomeOverview({ ...session, activeId: 3 })).toMatchObject({
    canManage: false,
    canInvite: false,
  });
  expect(
    cloud.get.mock.calls.some(([url]) => String(url).endsWith("/requested")),
  ).toBe(false);
});

it("does not request full-account invitations for a managed profile", async () => {
  overviewResponses(2);
  expect(
    (await getPlexHomeOverview({ ...session, activeId: 2 })).invites,
  ).toEqual([]);
  expect(
    cloud.get.mock.calls.some(([url]) => String(url).includes("/invites/")),
  ).toBe(false);
});

it("rejects a response belonging to a different account", async () => {
  overviewResponses(3);
  await expect(getPlexHomeOverview(session)).rejects.toThrow(
    "profile has changed",
  );
});

it("creates a managed profile with only the chosen name and age preset", async () => {
  const signal = new AbortController().signal;
  await changePlexHome(
    session,
    home,
    { type: "create", title: "  New child  ", restrictionProfile: "teen" },
    signal,
  );
  expect(cloud.post).toHaveBeenCalledWith(
    "https://plex.tv/api/v2/home/users/restricted",
    {
      friendlyName: "New child",
      sharingSettings: {},
      restrictionProfile: "teen",
    },
    expect.objectContaining({
      signal,
      headers: expect.objectContaining({ "X-Plex-Token": session.token }),
    }),
  );
});

it("changes only a dirty name and clears a preset using Plex's omission contract", async () => {
  await changePlexHome(session, home, {
    type: "rename",
    member: managed,
    title: "New name",
  });
  await changePlexHome(session, home, {
    type: "restrictions",
    member: managed,
    restrictionProfile: "unrestricted",
  });
  expect(cloud.post.mock.calls.map((call) => call.slice(0, 2))).toEqual([
    [
      "https://plex.tv/api/v2/home/users/restricted/2",
      { friendlyName: "New name" },
    ],
    ["https://plex.tv/api/v2/home/users/restricted/profile", { userId: 2 }],
  ]);
});

it.each(["1234", ""])(
  "sets/removes a managed PIN without requiring its old PIN",
  async (pin) => {
    await changePlexHome(session, home, {
      type: "pin",
      member: managed,
      pin,
      currentPin: "",
    });
    expect(cloud.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://plex.tv/api/v2/home/users/restricted/2",
        method: "POST",
        params: pin ? { pin } : { removePin: 1 },
      }),
    );
  },
);

it("changes the active full account's PIN with its current PIN", async () => {
  await changePlexHome(session, home, {
    type: "pin",
    member: owner,
    pin: "5678",
    currentPin: "1234",
  });
  expect(cloud.request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: "https://plex.tv/api/home/users/1",
      method: "PUT",
      params: { pin: "5678", currentPin: "1234" },
    }),
  );
});

it("never retains request secrets in a PIN error and allows retry", async () => {
  cloud.request.mockRejectedValueOnce({
    isAxiosError: true,
    config: { params: { pin: "1234" } },
    response: { status: 422, data: { errors: [{ message: "1234 failed" }] } },
  });
  const input = {
    type: "pin",
    member: managed,
    pin: "1234",
    currentPin: "",
  } as const;
  const failure = await changePlexHome(session, home, input).catch(
    (error) => error,
  );
  expect(failure.message).not.toContain("1234");
  expect(failure).not.toHaveProperty("config");
  await expect(changePlexHome(session, home, input)).resolves.toBeUndefined();
});

it.each([
  { type: "remove", member: owner },
  { type: "pin", member: regular, pin: "1234", currentPin: "1234" },
  { type: "rename", member: regular, title: "Changed" },
  { type: "pin", member: { ...managed, id: 99 }, pin: "1234", currentPin: "" },
] as const)(
  "blocks forbidden or stale member actions before sending a request: %o",
  async (input) => {
    await expect(changePlexHome(session, home, input)).rejects.toThrow(
      "cannot make",
    );
    expect(cloud.request).not.toHaveBeenCalled();
    expect(cloud.post).not.toHaveBeenCalled();
    expect(cloud.delete).not.toHaveBeenCalled();
  },
);

it("allows a regular member to leave and prevents removing other members", async () => {
  const memberSession = { ...session, activeId: 3 };
  const memberHome = { ...home, canManage: false };
  await changePlexHome(memberSession, memberHome, {
    type: "remove",
    member: regular,
  });
  expect(cloud.delete).toHaveBeenCalledWith(
    "https://plex.tv/api/home/users/3",
    expect.any(Object),
  );
  await expect(
    changePlexHome(memberSession, memberHome, {
      type: "remove",
      member: managed,
    }),
  ).rejects.toThrow("cannot make");
});

it("validates names, presets, PINs and the server-provided member limit", async () => {
  for (const input of [
    { type: "create", title: "kids", restrictionProfile: "teen" },
    { type: "create", title: "", restrictionProfile: "teen" },
    { type: "restrictions", member: managed, restrictionProfile: "invalid" },
    { type: "pin", member: owner, pin: "1234", currentPin: "" },
    { type: "pin", member: managed, pin: "12", currentPin: "" },
  ] as const)
    await expect(changePlexHome(session, home, input)).rejects.toThrow();
  await expect(
    changePlexHome(
      session,
      { ...home, maxSize: 3 },
      { type: "create", title: "Another", restrictionProfile: "unrestricted" },
    ),
  ).rejects.toThrow("member limit");
  expect(cloud.post).not.toHaveBeenCalled();
});

it("invites a Plex account and cancels only its Home invitation", async () => {
  await changePlexHome(session, home, {
    type: "invite",
    account: "  friend@example.com  ",
  });
  expect(cloud.post).toHaveBeenCalledWith(
    "https://plex.tv/api/home/users",
    undefined,
    expect.objectContaining({
      params: { invitedEmail: "friend@example.com", skipFriendship: 1 },
    }),
  );
  const invite = { id: "friend@example.com", title: "Friend", incoming: false };
  await changePlexHome(
    session,
    { ...home, invites: [invite] },
    { type: "invitation", invite, accept: false },
  );
  expect(cloud.request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: "https://plex.tv/api/invites/requested/friend%40example.com",
      method: "DELETE",
      params: { home: 1, friend: 0, server: 0 },
    }),
  );
});

it("accepts an incoming Home invitation without accepting a library share", async () => {
  const invite = { id: "incoming", title: "Friend", incoming: true };
  await changePlexHome(
    session,
    { ...home, invites: [invite] },
    { type: "invitation", invite, accept: true },
  );
  expect(cloud.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: "PUT",
      params: { home: 1, friend: 0, server: 0 },
    }),
  );
});

it("uses POST to create a first guest Home and PUT to disable its guest", async () => {
  await changePlexHome(
    session,
    { ...home, members: [owner] },
    { type: "guest", enabled: true },
  );
  await changePlexHome(session, home, { type: "guest", enabled: false });
  expect(
    cloud.request.mock.calls.map(([options]) => [
      options.method,
      options.params,
    ]),
  ).toEqual([
    ["POST", { guestEnabled: 1 }],
    ["PUT", { guestEnabled: 0 }],
  ]);
});
