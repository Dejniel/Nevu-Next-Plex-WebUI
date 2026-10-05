import type { HomeProfile } from "./authStorage";

/** The account and selected Home profile together scope all user data. */
export function plexProfileKey(
  owner: Pick<Plex.UserData, "id"> | null,
  profile: Pick<HomeProfile, "id"> | null,
) {
  return owner && profile ? `${owner.id}:${profile.id}` : null;
}
