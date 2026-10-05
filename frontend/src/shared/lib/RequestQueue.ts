interface Job {
  owner: object;
  offset: number;
  priority: number;
  run: () => Promise<unknown>;
}

/** Prioritize visible ranges and bound concurrent requests across collections. */
export class RequestQueue {
  private jobs: Job[] = [];
  private active = 0;

  constructor(private readonly concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new Error("The request queue must allow at least one request.");
  }

  add(job: Job) {
    this.jobs.push(job);
    this.pump();
  }

  remove(owner: object, keep: ReadonlySet<number> = new Set()) {
    this.jobs = this.jobs.filter(
      (job) => job.owner !== owner || keep.has(job.offset),
    );
  }

  private pump() {
    while (this.active < this.concurrency && this.jobs.length) {
      this.jobs.sort((a, b) => a.priority - b.priority);
      const job = this.jobs.shift()!;
      this.active++;
      void job.run().finally(() => {
        this.active--;
        this.pump();
      });
    }
  }
}
