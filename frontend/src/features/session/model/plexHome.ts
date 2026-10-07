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

export type PlexHomeChange =
  | { type: "create"; title: string; restrictionProfile: string }
  | {
      type: "edit";
      member: PlexHomeMember;
      title: string;
      restrictionProfile: string;
    }
  | { type: "pin"; member: PlexHomeMember; pin: string; currentPin: string }
  | { type: "remove"; member: PlexHomeMember }
  | { type: "invite"; account: string }
  | { type: "invitation"; invite: PlexHomeInvite; accept: boolean }
  | { type: "guest"; enabled: boolean };

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

export function canChangePlexHome(
  change: PlexHomeChange,
  overview: PlexHomeOverview,
  activeId: number,
) {
  if ("member" in change) {
    const member = overview.members.find(
      (item) => item.id === change.member.id,
    );
    if (!member) return false;
    const actions = homeMemberActions(member, activeId, overview.canManage);
    return change.type === "edit"
      ? actions.edit
      : change.type === "pin"
        ? actions.pin
        : actions.remove;
  }
  switch (change.type) {
    case "invitation":
      return (
        (!change.accept || change.invite.incoming) &&
        (change.invite.incoming || overview.canManage) &&
        overview.invites.some(
          (invite) =>
            invite.id === change.invite.id &&
            invite.incoming === change.invite.incoming,
        )
      );
    case "invite":
      return overview.canInvite;
    default:
      return overview.canManage;
  }
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
