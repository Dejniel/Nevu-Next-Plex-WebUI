import {
  AuthStorage,
  getActiveServerScope,
  getXPlexProps,
  useAuthSession,
} from "features/session/model";
import { publishMediaChange, validMediaRating } from "entities/media/model";
import { queryBuilder } from "shared/lib/query";
import { ProxiedRequest } from "shared/api/backend";

export async function setMediaRating(
  rating: number,
  ratingKey: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (rating !== -1 && (!validMediaRating(rating) || rating === 0))
    throw new Error("Choose a rating between 1 and 10.");
  const token = AuthStorage.getServerToken();
  if (!token) throw new Error("The active Plex profile session has expired.");
  const revision = useAuthSession.getState().revision;
  const scope = getActiveServerScope();
  if (useAuthSession.getState().status !== "ready" || !scope)
    throw new Error("The active Plex session changed. Open this action again.");
  signal?.throwIfAborted();
  const response = await ProxiedRequest(
    `/:/rate?${queryBuilder({
      identifier: "com.plexapp.plugins.library",
      key: ratingKey,
      rating,
      ...getXPlexProps(),
    })}`,
    "GET",
    {
      "X-Plex-Token": token,
      accept: "application/json",
    },
    undefined,
    signal,
  );
  signal?.throwIfAborted();
  const current = getActiveServerScope();
  if (
    useAuthSession.getState().status !== "ready" ||
    useAuthSession.getState().revision !== revision ||
    AuthStorage.getServerToken() !== token ||
    current?.serverId !== scope?.serverId ||
    current?.profileKey !== scope?.profileKey
  )
    throw new Error("The active Plex profile changed. Open this action again.");
  const accepted = response.status >= 200 && response.status < 300;
  if (accepted)
    publishMediaChange({
      ...scope,
      kind: "item",
      effect: "unknown",
      id: ratingKey,
    });
  return accepted;
}
