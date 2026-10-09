import {
  AuthStorage,
  useAuthSession,
  useServerSession,
} from "features/session/model";
import { subscribeToMediaChanges } from "entities/media/model";
import { ProxiedRequest } from "shared/api/backend";
import { PlexRequestError } from "shared/api/PlexClient";
import {
  buildApplyMatchPath,
  buildMatchSearchPath,
  createMetadataMatcher,
} from "./matching";

vi.mock("shared/api/backend", () => ({ ProxiedRequest: vi.fn() }));
const transport = vi.mocked(ProxiedRequest);
const item = { ratingKey: "42", type: "movie", title: "Film" } as Plex.Metadata;
const candidate = {
  guid: "plex://movie/1",
  name: "A title & more",
  year: 2024,
  type: "movie",
};
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  AuthStorage.saveActiveSession({
    profile: null,
    accountToken: "account",
    serverToken: "token",
  });
  useAuthSession.setState({
    status: "ready",
    revision: 1,
    ownerUser: { id: 1 } as Plex.UserData,
    activeUser: { id: 1, restricted: false } as Plex.UserData,
    activeProfile: {
      id: 1,
      title: "Owner",
      isOwner: true,
      protected: false,
      restricted: false,
    },
  });
  useServerSession.setState({
    server: { machineIdentifier: "local" } as Plex.ServerPreferences,
    canManageServer: true,
  });
  transport.mockResolvedValue({ status: 200, data: "" });
});

it("constructs manual search criteria and excludes empty options", () => {
  expect(
    buildMatchSearchPath("12/3", {
      title: " Seven Psychopaths ",
      year: 2012,
      language: "pl-PL",
      agent: "",
    }),
  ).toBe(
    "/library/metadata/12%2F3/matches?manual=1&title=Seven+Psychopaths&year=2012&language=pl-PL",
  );
});
it("uses native identifier syntax and ignores a prefilled year for an exact ID", () => {
  expect(
    buildMatchSearchPath("42", {
      title: "https://www.imdb.com/title/tt1217209/",
      year: 2026,
      agent: " tv.plex.agents.movie ",
    }),
  ).toBe(
    "/library/metadata/42/matches?manual=1&title=imdb-tt1217209&agent=tv.plex.agents.movie",
  );
});
it("normalizes results while dropping malformed candidates and other media types", async () => {
  transport.mockResolvedValue({
    status: 200,
    data: {
      MediaContainer: {
        SearchResult: [
          candidate,
          { name: "Missing guid" },
          { ...candidate, type: "show" },
        ],
      },
    },
  });
  const abort = signal();
  await expect(
    createMetadataMatcher(item).search({ title: "Film" }, abort),
  ).resolves.toEqual([candidate]);
  expect(transport).toHaveBeenCalledWith(
    "/library/metadata/42/matches?manual=1&title=Film",
    "GET",
    expect.objectContaining({ "X-Plex-Token": "token" }),
    undefined,
    abort,
  );
});
it.each(["movie", "show", "artist", "album"] as const)(
  "loads advertised primary agents for a %s",
  async (type) => {
    transport.mockResolvedValue({
      status: 200,
      data: {
        MediaContainer: {
          Agent: [
            { identifier: "tv.plex.agents.music", name: "Plex Music" },
            {
              identifier: "com.plexapp.agents.none",
              name: "Personal",
              primary: true,
            },
            { identifier: "secondary", name: "Secondary", primary: false },
          ],
        },
      },
    });
    await expect(
      createMetadataMatcher({ ...item, type }).agents(signal()),
    ).resolves.toEqual([
      { identifier: "tv.plex.agents.music", name: "Plex Music" },
    ]);
    expect(transport.mock.calls[0][0]).toBe(
      `/system/agents?mediaType=${{ movie: 1, show: 2, artist: 8, album: 9 }[type]}`,
    );
  },
);
it("distinguishes empty native results from failed or malformed responses", async () => {
  const source = createMetadataMatcher(item);
  transport.mockResolvedValue({ status: 200, data: { MediaContainer: {} } });
  await expect(source.search({ title: "Film" }, signal())).resolves.toEqual([]);
  await expect(source.agents(signal())).resolves.toEqual([]);
  for (const data of [
    {},
    { MediaContainer: "bad" },
    { MediaContainer: [] },
    { MediaContainer: { SearchResult: {} } },
  ]) {
    transport.mockResolvedValue({ status: 200, data });
    await expect(source.search({ title: "Film" }, signal())).rejects.toThrow(
      "invalid match results",
    );
  }
  transport.mockResolvedValue({ status: 503, data: "offline" });
  await expect(
    source.search({ title: "Film" }, signal()),
  ).rejects.toBeInstanceOf(PlexRequestError);
});
it.each(["match", "unmatch"])(
  "writes %s with captured credentials and publishes one scoped refresh",
  async (action) => {
    const changed = vi.fn();
    const stop = subscribeToMediaChanges(changed);
    try {
      const source = createMetadataMatcher(item);
      const abort = signal();
      if (action === "match") await source.apply(candidate, abort);
      else await source.unmatch(abort);
      expect(transport).toHaveBeenCalledWith(
        action === "match"
          ? buildApplyMatchPath("42", candidate)
          : "/library/metadata/42/unmatch",
        "PUT",
        expect.objectContaining({ "X-Plex-Token": "token" }),
        {},
        abort,
      );
      expect(changed).toHaveBeenCalledTimes(1);
      expect(changed.mock.calls[0][0]).toMatchObject({
        serverId: "local",
        profileKey: "1:1",
        kind: "item",
        effect: "unknown",
        id: "42",
      });
    } finally {
      stop();
    }
  },
);
it("writes only the native candidate identity, keeping artist matching a separate operation", () => {
  expect(buildApplyMatchPath("42", { ...candidate, parentName: "Miles Davis" }))
    .toBe("/library/metadata/42/match?guid=plex%3A%2F%2Fmovie%2F1&name=A+title+%26+more");
});
it.each(["profile", "token", "server", "revision", "restricted", "permission"])(
  "rejects writes after a %s change",
  async (change) => {
    const source = createMetadataMatcher(item);
    if (change === "profile")
      useAuthSession.setState({ activeProfile: { id: 2 } as never });
    if (change === "token")
      AuthStorage.saveActiveSession({
        profile: null,
        accountToken: "other",
        serverToken: "other",
      });
    if (change === "server")
      useServerSession.setState({
        server: { machineIdentifier: "other" } as Plex.ServerPreferences,
      });
    if (change === "revision") useAuthSession.setState({ revision: 2 });
    if (change === "restricted")
      useAuthSession.setState({
        activeUser: { id: 1, restricted: true } as Plex.UserData,
      });
    if (change === "permission")
      useServerSession.setState({ canManageServer: false });
    await expect(source.apply(candidate, signal())).rejects.toThrow();
    await expect(source.unmatch()).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  },
);
it("discards reads completed after a session change", async () => {
  transport.mockImplementation(async () => {
    useAuthSession.setState({ revision: 2 });
    return {
      status: 200,
      data: { MediaContainer: { SearchResult: [candidate] } },
    };
  });
  await expect(
    createMetadataMatcher(item).search({ title: "Film" }, signal()),
  ).rejects.toThrow("session changed");
});
it("reconciles only the captured scope if the session changes during a write", async () => {
  const changed = vi.fn();
  const stop = subscribeToMediaChanges(changed);
  transport.mockImplementation(async () => {
    useAuthSession.setState({ revision: 2, activeProfile: { id: 2 } as never });
    return { status: 200, data: "" };
  });
  try {
    await expect(
      createMetadataMatcher(item).apply(candidate, signal()),
    ).rejects.toThrow("session changed");
    expect(changed.mock.calls[0][0]).toMatchObject({ profileKey: "1:1" });
    expect(transport).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});
it.each(["aborted", "denied"])(
  "reconciles a possibly accepted %s write but retains its failure",
  async (kind) => {
    const controller = new AbortController();
    const changed = vi.fn();
    const stop = subscribeToMediaChanges(changed);
    transport.mockImplementation(async () => {
      if (kind === "aborted") controller.abort();
      return { status: kind === "denied" ? 403 : 200, data: "" };
    });
    try {
      await expect(
        createMetadataMatcher(item).apply(candidate, controller.signal),
      ).rejects.toThrow();
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  },
);
it("validates unsupported items and candidate types before issuing any writes", async () => {
  await expect(
    createMetadataMatcher({ ...item, type: "track" }).unmatch(),
  ).rejects.toThrow("does not support");
  expect(() =>
    createMetadataMatcher(item).apply({ ...candidate, type: "show" }, signal()),
  ).toThrow("media type");
  expect(transport).not.toHaveBeenCalled();
});
