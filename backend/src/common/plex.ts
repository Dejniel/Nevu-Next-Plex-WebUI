import axios from "axios";
import { PerPlexed } from "../types";

export async function CheckPlexUser(token: string): Promise<PerPlexed.PlexTV.User | null> {
    const data = await axios.get("https://plex.tv/api/v2/user", {
        headers: {
            "X-Plex-Token": token,
        },
    }).then(res => res.data as PerPlexed.PlexTV.User).catch(() => null);

    if (!data) return null;

    return data;
}

export function hasPlexFeature(value: unknown, feature: string): boolean {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value))
        return value.some((entry) => hasPlexFeature(entry, feature));

    const object = value as Record<string, unknown>;
    if (object.type === feature) return true;
    return Object.values(object).some((entry) => hasPlexFeature(entry, feature));
}

export function isPlexServerOwner(user: { restricted?: boolean } | null | undefined): boolean {
    return Boolean(user && !user.restricted);
}

export function canManagePlexServer(
    user: { restricted?: boolean } | null | undefined,
    providers: unknown,
): boolean {
    return isPlexServerOwner(user) && hasPlexFeature(providers, 'manage');
}
