import {
  bucketKey,
  isBucketKey,
  mergeObservations,
  parseObservations,
  pruneObservations,
  recordObservation,
  serializeObservations,
  type Observation,
  type Observations,
} from "../shared/sale-observations";

const SAVE_DELAY_MS = 3_000;
/** Pruning scans the whole log, so it runs at most hourly rather than on every save. */
const PRUNE_EVERY_MS = 3_600_000;

export type ObservationListener = (subjects: ReadonlySet<string>) => void;

/**
 * Tab-local view of the market outcome log, persisted to chrome.storage.local in one
 * entry per UTC day of listing end. A save rewrites only the days that changed, and
 * other tabs receive only those days, so cost stays flat as the log grows.
 */
export class SaleObservationStore {
  readonly observations: Observations = new Map();
  private listeners = new Set<ObservationListener>();
  private loaded?: Promise<void>;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty = new Set<string>();
  private lastPrune = 0;
  constructor(
    private storage: chrome.storage.StorageArea | undefined = globalThis.chrome
      ?.storage?.local,
  ) {}
  load(): Promise<void> {
    this.loaded ??= (async () => {
      if (!this.storage) return;
      try {
        const all = await this.storage.get(null);
        const changed = new Set<string>();
        for (const [key, value] of Object.entries(all))
          if (isBucketKey(key))
            for (const id of this.mergeIn(parseObservations(value)))
              changed.add(id);
        if (changed.size) this.notify(this.subjectsOf(changed));
      } catch {
        // Unavailable storage only disables persistence; observations still work in this tab.
      }
    })();
    return this.loaded;
  }
  /** Listeners receive the card IDs whose observations changed. */
  subscribe(listener: ObservationListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  record(auctionId: string, observation: Observation) {
    this.recordMany([[auctionId, observation]]);
  }
  /** Records a batch (e.g. one relayed auction page) with a single notification. */
  recordMany(entries: Iterable<[string, Observation]>) {
    const subjects = new Set<string>();
    for (const [auctionId, observation] of entries) {
      const id = auctionId.toLowerCase();
      const before = this.observations.get(id);
      if (!recordObservation(this.observations, id, observation)) continue;
      subjects.add(observation.subjectId);
      if (before) this.dirty.add(bucketKey(before.endsAt));
      this.dirty.add(bucketKey(this.observations.get(id)!.endsAt));
    }
    if (subjects.size) this.changed(subjects);
  }
  /** Call after resolving the given auctions in place (see resolveWithHistory). */
  resolved(auctionIds: string[]) {
    const subjects = new Set<string>();
    for (const id of auctionIds) {
      const o = this.observations.get(id);
      if (!o) continue;
      subjects.add(o.subjectId);
      this.dirty.add(bucketKey(o.endsAt));
    }
    if (subjects.size) this.changed(subjects);
  }
  /** Applies other tabs' writes from storage.onChanged. */
  external(changes: Record<string, chrome.storage.StorageChange>) {
    const changed = new Set<string>();
    for (const [key, change] of Object.entries(changes))
      if (isBucketKey(key) && change.newValue !== undefined)
        for (const id of this.mergeIn(parseObservations(change.newValue)))
          changed.add(id);
    if (changed.size) this.notify(this.subjectsOf(changed));
  }
  private mergeIn(from: Observations): string[] {
    const changed: string[] = [];
    for (const [id, o] of from)
      if (recordObservation(this.observations, id, o)) changed.push(id);
    return changed;
  }
  private subjectsOf(ids: Iterable<string>) {
    const subjects = new Set<string>();
    for (const id of ids) {
      const o = this.observations.get(id);
      if (o) subjects.add(o.subjectId);
    }
    return subjects;
  }
  private changed(subjects: Set<string>) {
    this.notify(subjects);
    this.scheduleSave();
  }
  private notify(subjects: ReadonlySet<string>) {
    for (const listener of this.listeners) listener(subjects);
  }
  private scheduleSave() {
    if (!this.storage || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void this.save();
    }, SAVE_DELAY_MS);
  }
  private async save() {
    if (!this.storage || !this.dirty.size) return;
    const keys = [...this.dirty];
    this.dirty.clear();
    try {
      await this.load();
      // Another tab may have written these days since; never drop its entries.
      const stored = await this.storage.get(keys);
      for (const key of keys)
        mergeObservations(this.observations, parseObservations(stored[key]));
      // Days emptied or trimmed by pruning are rewritten (or removed) too.
      if (Date.now() - this.lastPrune >= PRUNE_EVERY_MS) {
        this.lastPrune = Date.now();
        for (const key of pruneObservations(this.observations))
          if (!keys.includes(key)) keys.push(key);
      }
      const byKey = new Map<string, Observations>(
        keys.map((k) => [k, new Map()]),
      );
      for (const [id, o] of this.observations) {
        const day = byKey.get(bucketKey(o.endsAt));
        day?.set(id, o);
      }
      const write: Record<string, unknown> = {};
      const remove: string[] = [];
      for (const [key, day] of byKey)
        if (day.size) write[key] = serializeObservations(day);
        else remove.push(key);
      if (Object.keys(write).length) await this.storage.set(write);
      if (remove.length) await this.storage.remove(remove);
    } catch {
      // Quota or context errors leave the in-memory log intact; retry these days later.
      for (const key of keys) this.dirty.add(key);
    }
  }
}

export const saleObservations = new SaleObservationStore();
