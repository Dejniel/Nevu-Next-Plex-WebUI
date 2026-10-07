import type { HomeProfile } from "./authStorage";

export interface PlexHomeMember extends Omit<HomeProfile, "isOwner"> {
  admin: boolean;
  guest: boolean;
  restrictionProfile: string;
}

export interface PlexHomeInvite {
  id: string;
  title: string;
  incoming: boolean;
}

export interface PlexHomeOverview {
  members: PlexHomeMember[];
  invites: PlexHomeInvite[];
  canManage: boolean;
  canInvite: boolean;
  maxSize: number | null;
  guestEnabled: boolean;
}

export const HOME_RESTRICTION_PROFILES = [
  { value: "unrestricted", label: "None" },
  { value: "little_kid", label: "Younger kid" },
  { value: "older_kid", label: "Older kid" },
  { value: "teen", label: "Teen" },
] as const;

export function homeMemberActions(
  member: PlexHomeMember,
  activeId: number,
  canManage: boolean,
) {
  const own = member.id === activeId;
  return {
    edit: canManage && member.restricted && !member.guest,
    pin:
      !member.guest &&
      ((canManage && member.restricted) || (own && !member.restricted)),
    remove:
      !member.admin &&
      !member.guest &&
      (canManage || (own && !member.restricted)),
    leave: own && !member.admin && !member.restricted,
  };
}

export function homeProfiles(
  members: PlexHomeMember[],
  accountId: number,
): HomeProfile[] {
  return members.map(
    ({
      id,
      title,
      username,
      thumb,
      protected: protectedProfile,
      restricted,
    }) => ({
      id,
      title,
      username,
      thumb,
      protected: protectedProfile,
      restricted,
      isOwner: id === accountId,
    }),
  );
}
