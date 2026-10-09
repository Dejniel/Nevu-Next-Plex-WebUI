import { publishMediaChange } from "entities/media/model";
import {
  getXPlexProps,
  type CapturedPlexSession,
} from "features/session/model";
import { PlexClient, PlexRequestError } from "shared/api/PlexClient";
import { queryBuilder } from "shared/lib/query";
import { createRequestLimiter } from "shared/lib/requestLimiter";

export class WatchedActionError extends Error {
  constructor(
    readonly failedIds: string[],
    failures: unknown[],
  ) {
    const statuses = [
      ...new Set(
        failures.flatMap((error) =>
          error instanceof PlexRequestError ? [error.status] : [],
        ),
      ),
    ];
    super(
      `Plex could not update ${failedIds.length} item${failedIds.length === 1 ? "" : "s"}${statuses.length ? ` (HTTP ${statuses.join(", ")})` : ""}. You can retry the remaining items.`,
    );
  }
}

/** PMS is the source of watched state. Publish reconciliation hints even when a
 * submitted write fails or is aborted; never synthesize a local view count. */
export function createWatchedAction(session: CapturedPlexSession) {
  const client = new PlexClient(() => session.token);
  const plexProps = { ...getXPlexProps(), "X-Plex-Token": session.token };
  return async (
    watched: boolean,
    ids: readonly string[],
    signal: AbortSignal,
  ) => {
    session.assertCurrent(signal);
    if (!ids.length || ids.some((id) => !/^\d+$/.test(id)))
      throw new Error("Select valid Plex library items.");
    const uniqueIds = [...new Set(ids)];
    const run = createRequestLimiter(4);
    const results = await Promise.allSettled(
      uniqueIds.map((id) =>
        run(signal, 0, async () => {
          session.assertCurrent(signal);
          try {
            await client.get<void>(
              `/:/${watched ? "scrobble" : "unscrobble"}?${queryBuilder({
                key: id,
                identifier: "com.plexapp.plugins.library",
                ...plexProps,
              })}`,
              signal,
            );
          } finally {
            if (session.scope)
              publishMediaChange({
                ...session.scope,
                kind: "item",
                effect: "unknown",
                id,
              });
          }
          session.assertCurrent(signal);
        }),
      ),
    );
    session.assertCurrent(signal);
    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [{ id: uniqueIds[index], error: result.reason as unknown }]
        : [],
    );
    if (failures.length)
      throw new WatchedActionError(
        failures.map(({ id }) => id),
        failures.map(({ error }) => error),
      );
  };
}
