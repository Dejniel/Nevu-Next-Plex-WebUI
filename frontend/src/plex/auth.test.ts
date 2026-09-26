import axios from "axios";
import { buildPlexAuthUrl } from "./auth";
import { getLoggedInUser, getPin } from "./auth";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => {
  localStorage.clear();
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
      { headers: { accept: "application/json" } },
    );
  });

  it("does not request user data before an account token exists", async () => {
    await expect(getLoggedInUser()).resolves.toBeNull();

    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
