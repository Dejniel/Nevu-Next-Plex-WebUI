import { ProxiedRequest } from "shared/api/backend";
import { getServerSessionContext } from "./server";

jest.mock("shared/api/backend", () => ({ ProxiedRequest: jest.fn() }));

const request = ProxiedRequest as jest.MockedFunction<typeof ProxiedRequest>;

beforeEach(() => request.mockReset());

it("loads the server and its capabilities with the active token", async () => {
  request
    .mockResolvedValueOnce({ status: 200, data: { MediaContainer: { friendlyName: "Media" } } } as never)
    .mockResolvedValueOnce({ status: 200, data: { Feature: [{ type: "manage" }] } } as never);

  await expect(getServerSessionContext("token")).resolves.toEqual({
    server: { friendlyName: "Media" },
    providers: { Feature: [{ type: "manage" }] },
  });
  expect(request).toHaveBeenCalledWith("/", "GET", {
    Accept: "application/json",
    "X-Plex-Token": "token",
  });
});

it("keeps server details when the optional capability request fails", async () => {
  request
    .mockResolvedValueOnce({ status: 200, data: { MediaContainer: { friendlyName: "Media" } } } as never)
    .mockResolvedValueOnce({ status: 503, data: "Unavailable" } as never);

  await expect(getServerSessionContext("token")).resolves.toEqual({
    server: { friendlyName: "Media" },
    providers: null,
  });
});
