import axios from "axios";
import {
  buildPlexAuthUrl,
  getHomeProfiles,
  getLoggedInUser,
  getPin,
  switchHomeProfile,
} from "./auth";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});

describe("buildPlexAuthUrl", () => {
  it("builds the Plex forwarding URL with an encoded callback", () => {
    const url = buildPlexAuthUrl({
      clientIdentifier: "client&id",
      pinCode: "pin=code",
      forwardUrl: "http://192.168.10.197:3101/login?pinID=123",
    });
    const [baseUrl, query] = url.split("#?");
    const params = new URLSearchParams(query);

    expect(baseUrl).toBe("https://app.plex.tv/auth");
    expect(params.get("clientID")).toBe("client&id");
    expect(params.get("code")).toBe("pin=code");
    expect(params.get("context[device][product]")).toBe("NEVU");
    expect(params.get("forwardUrl")).toBe(
      "http://192.168.10.197:3101/login?pinID=123",
    );
  });

  it("requests a strong PIN for the forwarding flow", async () => {
    localStorage.setItem("clientID", "test-client");
    mockedAxios.post.mockResolvedValue({ data: { id: 123, code: "pin" } });

    await getPin();

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/plex\.tv\/api\/v2\/pins\?.*strong=true/,
      ),
      undefined,
      { headers: { Accept: "application/json" } },
    );
  });

  it("does not request user data before an account token exists", async () => {
    await expect(getLoggedInUser()).resolves.toBeNull();

    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("returns the owner and Plex Home users only", async () => {
    mockedAxios.get.mockResolvedValue({
      data: `<MediaContainer>
        <User id="2" title="Home user" home="1" protected="1" restricted="1" />
        <User id="3" title="Friend" home="0" protected="0" restricted="0" />
      </MediaContainer>`,
    });

    const profiles = await getHomeProfiles("owner-token", {
      id: 1,
      title: "Owner",
      protected: true,
      restricted: false,
    } as Plex.UserData);

    expect(profiles.map(({ id, title, isOwner }) => ({ id, title, isOwner }))).toEqual([
      { id: 1, title: "Owner", isOwner: true },
      { id: 2, title: "Home user", isOwner: false },
    ]);
  });

  it("switches a Home user with Plex client headers", async () => {
    mockedAxios.post.mockResolvedValue({
      data: '<user id="2" authenticationToken="profile-token" />',
    });

    await expect(
      switchHomeProfile(
        "owner-token",
        {
          id: 2,
          title: "Home user",
          protected: true,
          restricted: true,
          isOwner: false,
        },
        "1234",
      ),
    ).resolves.toBe("profile-token");

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://plex.tv/api/home/users/2/switch?pin=1234",
      undefined,
      {
        headers: expect.objectContaining({
          Accept: "application/xml",
          "X-Plex-Product": "NEVU",
          "X-Plex-Token": "owner-token",
        }),
      },
    );
  });
});
