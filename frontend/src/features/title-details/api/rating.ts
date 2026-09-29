import { AuthStorage } from "features/session/model";
import { getXPlexProps } from "features/session/model";
import { queryBuilder } from "shared/lib/query";
import { ProxiedRequest } from "shared/api/backend";

export async function setMediaRating(
  rating: number,
  ratingKey: string,
): Promise<boolean> {
  const response = await ProxiedRequest(
    `/:/rate?${queryBuilder({
      identifier: "com.plexapp.plugins.library",
      key: ratingKey,
      rating,
      ...getXPlexProps(),
    })}`,
    "GET",
    {
      "X-Plex-Token": AuthStorage.getServerToken() ?? "",
      accept: "application/json",
    },
  );
  return response.status === 200;
}
