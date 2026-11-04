export class ReadCache {
  private values = new Map<string, { until: number; value: unknown }>();
  private pending = new Map<string, Promise<unknown>>();
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
  async get<T>(key: string, load: () => Promise<T>, fresh = false): Promise<T> {
    if (fresh) {
      this.values.delete(key);
      this.pending.delete(key);
    }
    const hit = this.values.get(key);
    if (hit && hit.until > Date.now()) return hit.value as T;
    const active = this.pending.get(key);
    if (active) return active as Promise<T>;
    const epoch = this.epoch;
    const task: Promise<T> = load().then((value) => {
      if (epoch === this.epoch && this.pending.get(key) === task) {
        this.values.delete(key);
        this.values.set(key, { until: Date.now() + this.ttl, value });
        while (this.values.size > this.limit)
          this.values.delete(this.values.keys().next().value!);
      }
      return value;
    });
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      if (this.pending.get(key) === task) this.pending.delete(key);
    }
  }
}
