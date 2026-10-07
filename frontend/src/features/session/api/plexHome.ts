import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { APP_VERSION } from "shared/config/version";
import {
  HOME_RESTRICTION_PROFILES,
  canChangePlexHome,
} from "../model/plexHome";
import type {
  PlexHomeInvite,
  PlexHomeMember,
  PlexHomeOverview,
  PlexHomeChange,
} from "../model/plexHome";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
});
const CLOUD = "https://plex.tv";

export interface PlexHomeSession {
  token: string;
  activeId: number;
}

function config(session: PlexHomeSession, signal?: AbortSignal) {
  return {
    signal,
    timeout: 15000,
    headers: {
      Accept: "application/json",
      "X-Plex-Token": session.token,
      "X-Plex-Client-Identifier":
        localStorage.getItem("clientID") || "nevu-web",
      "X-Plex-Product": "NEVU",
      "X-Plex-Version": APP_VERSION,
    },
  };
}

function boolean(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function collection(
  data: unknown,
  key: "User" | "Invite",
): Record<string, unknown>[] {
  const parsed = typeof data === "string" ? parser.parse(data) : data;
  const container = parsed?.MediaContainer;
  if (container === "") return [];
  if (!container || typeof container !== "object")
    throw new Error("Plex returned an invalid Home response.");
  const entries = container[key];
  return entries ? (Array.isArray(entries) ? entries : [entries]) : [];
}

async function request<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (axios.isCancel(error))
      throw new DOMException("Plex Home request cancelled", "AbortError");
    if (!axios.isAxiosError(error)) throw error;
    const data = error.response?.data;
    const parsed = typeof data === "string" ? parser.parse(data) : data;
    const message =
      parsed?.errors?.[0]?.message ||
      parsed?.errors?.error?.[0]?.message ||
      parsed?.errors?.error?.message ||
      parsed?.error?.message;
    // Do not retain an Axios error: its request configuration can contain a PIN/token.
    throw new Error(
      typeof message === "string"
        ? message
        : error.response?.status === 401
          ? "Your Plex session has expired. Sign in again."
          : error.response?.status === 403
            ? "Plex did not allow this operation for the active profile."
            : "Plex Home is unavailable or could not save this change. Try again.",
    );
  }
}

export async function getPlexHomeMembers(
  token: string,
  signal?: AbortSignal,
): Promise<PlexHomeMember[]> {
  return request(async () => {
    const response = await axios.get(
      `${CLOUD}/api/home/users`,
      config({ token, activeId: 0 }, signal),
    );
    return collection(response.data, "User").map((user) => ({
      id: Number(user.id),
      title: String(user.title || user.username || "Plex Home user"),
      username: user.username ? String(user.username) : undefined,
      thumb: user.thumb ? String(user.thumb) : undefined,
      admin: boolean(user.admin),
      guest: boolean(user.guest),
      protected: boolean(user.protected),
      restricted: boolean(user.restricted),
      restrictionProfile: String(user.restrictionProfile || "unrestricted"),
    }));
  });
}

async function getInvites(
  session: PlexHomeSession,
  incoming: boolean,
  signal?: AbortSignal,
): Promise<PlexHomeInvite[]> {
  const response = await axios.get(
    `${CLOUD}/api/invites/${incoming ? "requests" : "requested"}`,
    config(session, signal),
  );
  return collection(response.data, "Invite")
    .filter((invite) => boolean(invite.home))
    .map((invite) => ({
      id: String(invite.id),
      title: String(
        invite.friendlyName || invite.username || invite.email || "Plex user",
      ),
      incoming,
    }));
}

export async function getPlexHomeOverview(
  session: PlexHomeSession,
  signal?: AbortSignal,
): Promise<PlexHomeOverview> {
  return request(async () => {
    const [members, userResponse, homeResponse] = await Promise.all([
      getPlexHomeMembers(session.token, signal),
      axios.get(`${CLOUD}/api/v2/user`, config(session, signal)),
      axios
        .get(`${CLOUD}/api/v2/home`, config(session, signal))
        .catch((error) => {
          if (axios.isAxiosError(error) && error.response?.status === 404)
            return { data: null };
          throw error;
        }),
    ]);
    const user = userResponse.data;
    if (Number(user.id) !== session.activeId)
      throw new Error("The active Plex profile has changed. Reload this page.");
    const own = members.find((member) => member.id === session.activeId);
    const canManage = Boolean(own?.admin && !user.restricted);
    const [sent, received] = await Promise.all([
      canManage ? getInvites(session, false, signal) : [],
      !user.restricted ? getInvites(session, true, signal) : [],
    ]);
    return {
      members,
      invites: [...sent, ...received],
      canManage,
      canInvite:
        canManage &&
        Boolean(homeResponse.data?.subscription || user.subscription?.active),
      maxSize:
        Number.isInteger(user.maxHomeSize) && user.maxHomeSize > 0
          ? user.maxHomeSize
          : null,
      guestEnabled: Boolean(homeResponse.data?.guestEnabled),
    };
  });
}

export async function changePlexHome(
  session: PlexHomeSession,
  overview: PlexHomeOverview,
  change: PlexHomeChange,
  signal?: AbortSignal,
): Promise<void> {
  const member =
    "member" in change
      ? overview.members.find((item) => item.id === change.member.id)
      : undefined;
  if (!canChangePlexHome(change, overview, session.activeId))
    throw new Error("The active profile cannot make this Plex Home change.");

  if (change.type === "create" || change.type === "edit") {
    const title = change.title.trim();
    if (!title || title.length > 100)
      throw new Error("Enter a name between 1 and 100 characters.");
    if (
      overview.members.some(
        (item) =>
          item.id !== member?.id &&
          item.title.toLocaleLowerCase() === title.toLocaleLowerCase(),
      )
    )
      throw new Error("A Home user already exists with this name.");
  }
  if (
    (change.type === "create" ||
      (change.type === "edit" &&
        change.restrictionProfile !== member?.restrictionProfile)) &&
    !HOME_RESTRICTION_PROFILES.some(
      (profile) => profile.value === change.restrictionProfile,
    )
  )
    throw new Error("Select a supported restriction profile.");
  if (
    (change.type === "create" ||
      change.type === "invite" ||
      (change.type === "guest" && change.enabled)) &&
    overview.maxSize !== null &&
    overview.members.length >= overview.maxSize
  )
    throw new Error("Your Plex Home has reached its member limit.");
  if (
    change.type === "pin" &&
    ((!/^\d{4}$/.test(change.pin) && change.pin !== "") ||
      (member?.protected &&
        !member.restricted &&
        !/^\d{4}$/.test(change.currentPin)))
  )
    throw new Error("Enter a four-digit PIN.");
  if (
    change.type === "invite" &&
    (!change.account.trim() || change.account.trim().length > 254)
  )
    throw new Error("Enter a Plex email or username.");

  await request(async () => {
    const options = config(session, signal);
    switch (change.type) {
      case "create":
        await axios.post(
          `${CLOUD}/api/v2/home/users/restricted`,
          {
            friendlyName: change.title.trim(),
            sharingSettings: {},
            ...(change.restrictionProfile !== "unrestricted" && {
              restrictionProfile: change.restrictionProfile,
            }),
          },
          options,
        );
        break;
      case "edit":
        if (change.title.trim() !== member!.title)
          await axios.post(
            `${CLOUD}/api/v2/home/users/restricted/${member!.id}`,
            { friendlyName: change.title.trim() },
            options,
          );
        signal?.throwIfAborted();
        if (change.restrictionProfile !== member!.restrictionProfile)
          await axios.post(
            `${CLOUD}/api/v2/home/users/restricted/profile`,
            {
              userId: member!.id,
              ...(change.restrictionProfile !== "unrestricted" && {
                restrictionProfile: change.restrictionProfile,
              }),
            },
            options,
          );
        break;
      case "pin": {
        const params = member!.restricted
          ? change.pin
            ? { pin: change.pin }
            : { removePin: 1 }
          : {
              pin: change.pin,
              ...(member!.protected && { currentPin: change.currentPin }),
            };
        // Plex's PIN API accepts query parameters; send only to Plex, never the Nevu proxy.
        const path = member!.restricted
          ? `/api/v2/home/users/restricted/${member!.id}`
          : `/api/home/users/${member!.id}`;
        try {
          await axios.request({
            ...options,
            url: `${CLOUD}${path}`,
            method: member!.restricted ? "POST" : "PUT",
            params,
          });
        } catch {
          if (signal?.aborted)
            throw new DOMException("Plex Home request cancelled", "AbortError");
          throw new Error(
            "Plex could not change this PIN. Check the current PIN and profile permissions.",
          );
        }
        break;
      }
      case "remove":
        await axios.delete(`${CLOUD}/api/home/users/${member!.id}`, options);
        break;
      case "invite":
        await axios.post(`${CLOUD}/api/home/users`, undefined, {
          ...options,
          params: { invitedEmail: change.account.trim(), skipFriendship: 1 },
        });
        break;
      case "invitation":
        await axios.request({
          ...options,
          url: `${CLOUD}/api/invites/${change.invite.incoming ? "requests" : "requested"}/${encodeURIComponent(change.invite.id)}`,
          method: change.accept ? "PUT" : "DELETE",
          params: { home: 1, friend: 0, server: 0 },
        });
        break;
      case "guest":
        await axios.request({
          ...options,
          url: `${CLOUD}/api/home`,
          method:
            change.enabled && overview.members.length === 1 ? "POST" : "PUT",
          params: { guestEnabled: Number(change.enabled) },
        });
    }
  });
}
