export type RequestPriority = "foreground" | "background";
const priorities = new WeakMap<AbortSignal, RequestPriority>();
export function setRequestPriority(
  signal: AbortSignal,
  priority: RequestPriority,
) {
  priorities.set(signal, priority);
  return signal;
}
export function requestPriority(signal?: AbortSignal): RequestPriority {
  return (signal && priorities.get(signal)) || "foreground";
}

interface Job {
  key: string;
  priority: RequestPriority;
  start(): void;
}

/** One budget for all reads in a game tab; user interactions go first. */
export class RequestScheduler {
  private queue: Job[] = [];
  private running = 0;
  private backgroundRunning = 0;
  constructor(private concurrency = 3) {}
  promote(key: string) {
    for (const job of this.queue)
      if (job.key === key) job.priority = "foreground";
    this.pump();
  }
  /** Serves a queued read next: it is needed on screen now (no extra request). */
  expedite(key: string) {
    const jobs = this.queue.filter((job) => job.key === key);
    if (!jobs.length) return;
    for (const job of jobs) job.priority = "foreground";
    this.queue = [...jobs, ...this.queue.filter((job) => job.key !== key)];
    this.pump();
  }
  promotePrefix(prefix: string) {
    for (const job of this.queue)
      if (job.key.startsWith(prefix)) job.priority = "foreground";
    this.pump();
  }
  run<T>(key: string, signal: AbortSignal, load: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const cancel = () => {
        this.queue = this.queue.filter((item) => item !== job);
        reject(signal.reason);
      };
      const job: Job = {
        key,
        priority: requestPriority(signal),
        start: () => {
          signal.removeEventListener("abort", cancel);
          this.running++;
          const background = job.priority === "background";
          if (background) this.backgroundRunning++;
          void Promise.resolve()
            .then(() => {
              signal.throwIfAborted();
              return load();
            })
            .then(resolve, reject)
            .finally(() => {
              this.running--;
              if (background) this.backgroundRunning--;
              this.pump();
            });
        },
      };
      signal.addEventListener("abort", cancel, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }
  private pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const foreground = this.queue.findIndex(
        (job) => job.priority === "foreground",
      );
      // Leave a slot available for a hover/click while overlays are loading.
      if (
        foreground < 0 &&
        this.backgroundRunning >= Math.max(1, this.concurrency - 1)
      )
        return;
      this.queue.splice(foreground < 0 ? 0 : foreground, 1)[0].start();
    }
  }
}
