import { getBackendURL } from "shared/api/backend";
import {
  parsePlexServerChanges,
  type PlexServerChange,
} from "../model/serverChanges";

/** Plex SSE works through the existing HTTP proxy, including remote deployments. */
export function connectPlexServerEvents(
  token: string,
  onChange: (change: PlexServerChange) => void,
) {
  if (typeof EventSource === "undefined") return () => undefined;
  const params = new URLSearchParams({
    "X-Plex-Token": token,
    filters: "timeline,preference,provider.change",
  });
  const stream = new EventSource(
    `${getBackendURL()}/dynproxy/:/eventsource/notifications?${params}`,
  );
  const handlers = ["timeline", "preference", "provider.change"].map((name) => {
    const handler = (event: MessageEvent<string>) =>
      parsePlexServerChanges(name, event.data).forEach((change) =>
        onChange(change),
      );
    stream.addEventListener(name, handler as EventListener);
    return { name, handler };
  });
  let interrupted = false;
  stream.onerror = () => {
    interrupted = true;
  };
  stream.onopen = () => {
    if (interrupted) onChange({ kind: "server" });
    interrupted = false;
  };
  return () => {
    stream.onopen = null;
    stream.onerror = null;
    handlers.forEach(({ name, handler }) =>
      stream.removeEventListener(name, handler as EventListener),
    );
    stream.close();
  };
}
