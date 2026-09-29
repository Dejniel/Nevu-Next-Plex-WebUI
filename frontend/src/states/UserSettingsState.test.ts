import axios from "axios";
import { AuthStorage, HomeProfile } from "features/session/model";
import {
  defaultUserSettings,
  useUserSettings,
  userSettingsCacheKey,
} from "./UserSettingsState";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;
const profile: HomeProfile = {
  id: 2,
  title: "Home user",
  protected: false,
  restricted: false,
  isOwner: false,
};

function saveSession(accountToken = "profile-token") {
  AuthStorage.saveActiveSession({
    profile,
    accountToken,
    serverToken: "server-token",
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
  useUserSettings.getState().reset();
  saveSession();
});

describe("UserSettingsState", () => {
  it("loads authoritative profile settings before becoming ready", async () => {
    mockedAxios.get.mockResolvedValue({
      data: [
        { key: "LIBRARY_CARD_LAYOUT", value: "poster" },
        { key: "LIBRARY_CARD_SIZE", value: "65" },
      ],
    });

    await useUserSettings.getState().initialize("owner:2");

    expect(useUserSettings.getState()).toMatchObject({
      status: "ready",
      profileKey: "owner:2",
      settings: {
        ...defaultUserSettings,
        LIBRARY_CARD_LAYOUT: "poster",
        LIBRARY_CARD_SIZE: "65",
      },
    });
    expect(
      JSON.parse(localStorage.getItem(userSettingsCacheKey("owner:2")) || "{}"),
    ).toMatchObject({ LIBRARY_CARD_LAYOUT: "poster", LIBRARY_CARD_SIZE: "65" });
  });

  it("uses the profile cache when the backend cannot be reached", async () => {
    localStorage.setItem(
      userSettingsCacheKey("owner:2"),
      JSON.stringify({ LIBRARY_CARD_LAYOUT: "poster" }),
    );
    mockedAxios.get.mockRejectedValue(new Error("offline"));

    await useUserSettings.getState().initialize("owner:2");

    expect(useUserSettings.getState()).toMatchObject({
      status: "error",
      profileKey: "owner:2",
      settings: { LIBRARY_CARD_LAYOUT: "poster" },
    });
  });

  it("ignores a late response from the previous profile", async () => {
    const first = deferred<{ data: Array<{ key: string; value: string }> }>();
    const second = deferred<{ data: Array<{ key: string; value: string }> }>();
    mockedAxios.get
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstLoad = useUserSettings.getState().initialize("owner:2");
    saveSession("other-profile-token");
    const secondLoad = useUserSettings.getState().initialize("owner:3");

    second.resolve({ data: [{ key: "LIBRARY_CARD_LAYOUT", value: "poster" }] });
    await secondLoad;
    first.resolve({ data: [{ key: "LIBRARY_CARD_LAYOUT", value: "landscape" }] });
    await firstLoad;

    expect(useUserSettings.getState()).toMatchObject({
      status: "ready",
      profileKey: "owner:3",
      settings: { LIBRARY_CARD_LAYOUT: "poster" },
    });
  });

  it("updates immediately and rolls back a failed save", async () => {
    mockedAxios.get.mockResolvedValue({
      data: [{ key: "LIBRARY_CARD_LAYOUT", value: "landscape" }],
    });
    await useUserSettings.getState().initialize("owner:2");

    const request = deferred<unknown>();
    mockedAxios.post.mockReturnValue(request.promise);
    const save = useUserSettings
      .getState()
      .setSetting("LIBRARY_CARD_LAYOUT", "poster");

    expect(useUserSettings.getState().settings.LIBRARY_CARD_LAYOUT).toBe("poster");

    request.reject(new Error("write failed"));
    await expect(save).resolves.toBe(false);
    expect(useUserSettings.getState().settings.LIBRARY_CARD_LAYOUT).toBe("landscape");
  });
});
