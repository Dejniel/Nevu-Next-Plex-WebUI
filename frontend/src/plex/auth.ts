import axios from "axios";
import { queryBuilder } from "./QuickFunctions";

export interface PlexAuthUrlOptions {
  clientIdentifier: string;
  pinCode: string;
  forwardUrl: string;
}

export function buildPlexAuthUrl({
  clientIdentifier,
  pinCode,
  forwardUrl,
}: PlexAuthUrlOptions): string {
  const params = new URLSearchParams({
    clientID: clientIdentifier,
    code: pinCode,
    "context[device][product]": "NEVU",
    forwardUrl,
  });

  return `https://app.plex.tv/auth#?${params.toString()}`;
}

export async function getAccessToken(pin: string): Promise<Plex.TokenData> {
  const res = await axios.get(
    `https://plex.tv/api/v2/pins/${pin}?${queryBuilder({
      "X-Plex-Client-Identifier": localStorage.getItem("clientID"),
    })}`,
    {
      headers: {
        accept: "application/json",
      },
    },
  );
  return res.data;
}

export async function getPin(): Promise<Plex.TokenData> {
  const res = await axios.post(
    `https://plex.tv/api/v2/pins?${queryBuilder({
      strong: true,
      "X-Plex-Client-Identifier": localStorage.getItem("clientID"),
      "X-Plex-Product": "NEVU",
    })}`,
    undefined,
    {
      headers: {
        accept: "application/json",
      },
    },
  );
  return res.data;
}

export async function getLoggedInUser(): Promise<Plex.UserData | null> {
  const token = localStorage.getItem("accAccessToken");
  if (!token) return null;

  const res = await axios
    .get(
      `https://plex.tv/api/v2/user?${queryBuilder({
        "X-Plex-Token": token,
        "X-Plex-Product": "NEVU",
        "X-Plex-Client-Identifier": localStorage.getItem("clientID"),
      })}`,
      {
        headers: {
          accept: "application/json",
        },
      },
    )
    .catch((err) => ({
      status: err.response?.status || 500,
      data: err.response?.data || "Internal server error",
    }));

  return res.status === 200 ? res.data : null;
}
