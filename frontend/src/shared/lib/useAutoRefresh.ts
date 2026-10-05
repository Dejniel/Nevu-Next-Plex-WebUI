import { useEffect, useRef } from "react";
import { refreshScheduler, type RefreshSubscription } from "./autoRefresh";

/** identity changes dispose pending lifecycle work for the previous resource. */
export function useAutoRefresh(
  identity: string | null,
  refresh: () => void | Promise<void>,
) {
  const callback = useRef(refresh);
  callback.current = refresh;
  const subscription = useRef<RefreshSubscription | null>(null);
  useEffect(() => {
    if (!identity) return;
    const current = refreshScheduler.subscribe(() => callback.current());
    subscription.current = current;
    return () => {
      current.dispose();
      subscription.current = null;
    };
  }, [identity]);
  return subscription;
}
