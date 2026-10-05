export interface RefreshSubscription {
  invalidate: () => void;
  refresh: () => Promise<void>;
  dispose: () => void;
}

interface Entry {
  run: () => void | Promise<void>;
  lastAttempt: number;
  dirty: boolean;
  pending: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  active: boolean;
}

/** One browser lifecycle and clock, with data ownership left to subscribers. */
export class RefreshScheduler {
  private entries = new Set<Entry>();
  private clock: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly interval = 60_000,
    private readonly staleTime = 30_000,
    private readonly debounce = 500,
  ) {}

  subscribe(run: Entry["run"]): RefreshSubscription {
    const entry: Entry = {
      run,
      lastAttempt: Date.now(),
      dirty: false,
      pending: null,
      timer: null,
      active: true,
    };
    this.entries.add(entry);
    if (this.entries.size === 1) {
      window.addEventListener("focus", this.resume);
      window.addEventListener("online", this.reconnect);
      document.addEventListener("visibilitychange", this.resume);
      this.clock = setInterval(this.tick, this.interval);
    }
    return {
      invalidate: () => {
        entry.dirty = true;
        this.schedule(entry);
      },
      refresh: () => this.execute(entry),
      dispose: () => {
        entry.active = false;
        if (entry.timer) clearTimeout(entry.timer);
        this.entries.delete(entry);
        if (this.entries.size) return;
        if (this.clock) clearInterval(this.clock);
        this.clock = null;
        window.removeEventListener("focus", this.resume);
        window.removeEventListener("online", this.reconnect);
        document.removeEventListener("visibilitychange", this.resume);
      },
    };
  }

  private visible = () => document.visibilityState !== "hidden";

  private schedule(entry: Entry) {
    if (!entry.active || !this.visible() || entry.timer || entry.pending)
      return;
    // A bounded delay coalesces a scan's events without waiting for it to finish.
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (this.visible()) void this.execute(entry);
    }, this.debounce);
  }

  private execute(entry: Entry): Promise<void> {
    if (!entry.active) return Promise.resolve();
    if (entry.pending) return entry.pending;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.dirty = false;
    entry.lastAttempt = Date.now();
    const pending = Promise.resolve()
      .then(() => entry.active && entry.run())
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        entry.pending = null;
        if (entry.dirty) this.schedule(entry);
      });
    entry.pending = pending;
    return pending;
  }

  private resume = () => {
    if (!this.visible()) return;
    this.entries.forEach((entry) => {
      if (entry.dirty || Date.now() - entry.lastAttempt >= this.staleTime)
        this.schedule(entry);
    });
  };

  private reconnect = () => {
    this.entries.forEach((entry) => {
      entry.dirty = true;
    });
    this.resume();
  };

  private tick = () => {
    if (!this.visible()) return;
    this.entries.forEach((entry) => {
      if (entry.dirty || Date.now() - entry.lastAttempt >= this.interval)
        this.schedule(entry);
    });
  };
}

export const refreshScheduler = new RefreshScheduler();
