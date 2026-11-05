interface PendingRead {
  promise: Promise<unknown>;
  controller: AbortController;
  users: number;
  settled: boolean;
}
export class ReadCache {
  private values = new Map<string, { until: number; value: unknown }>();
  private pending = new Map<string, PendingRead>();
  private epoch = 0;
  constructor(
    private limit = 100,
    private ttl = 300_000,
  ) {}
  clear() {
    this.epoch++;
    this.values.clear();
    this.pending.clear();
  }
  hasPending(key: string) {
    return this.pending.has(key);
  }
  pendingSignal(key: string) {
    return this.pending.get(key)?.controller.signal;
  }
  delete(key: string) {
    this.values.delete(key);
    this.pending.delete(key);
  }
  async get<T>(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    fresh = false,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    if (fresh) {
      this.values.delete(key);
      this.pending.delete(key);
    }
    const hit = this.values.get(key);
    if (hit && hit.until > Date.now()) {
      this.values.delete(key);
      this.values.set(key, hit);
      return hit.value as T;
    }
    let active = this.pending.get(key);
    if (!active) {
      const epoch = this.epoch;
      const entry: PendingRead = {
        controller: new AbortController(),
        users: 0,
        settled: false,
        promise: Promise.resolve(),
      };
      entry.promise = load(entry.controller.signal)
        .then((value) => {
          if (
            epoch === this.epoch &&
            this.pending.get(key) === entry &&
            !entry.controller.signal.aborted
          ) {
            this.values.delete(key);
            this.values.set(key, { until: Date.now() + this.ttl, value });
            while (this.values.size > this.limit)
              this.values.delete(this.values.keys().next().value!);
          }
          return value;
        })
        .finally(() => {
          entry.settled = true;
          if (this.pending.get(key) === entry) this.pending.delete(key);
        });
      this.pending.set(key, entry);
      active = entry;
    }
    const entry = active;
    entry.users++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener("abort", cancel);
        entry.users--;
        if (!entry.users && !entry.settled) {
          if (this.pending.get(key) === entry) this.pending.delete(key);
          entry.controller.abort();
        }
        return true;
      };
      const cancel = () => {
        if (finish()) reject(signal!.reason);
      };
      signal?.addEventListener("abort", cancel, { once: true });
      void entry.promise.then(
        (value) => {
          if (finish()) resolve(value as T);
        },
        (error) => {
          if (finish()) reject(error);
        },
      );
    });
  }
}
