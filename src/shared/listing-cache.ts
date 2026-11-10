import {
  validRecordedListing,
  type RecordedListing,
} from "../kosmora/listing-capture";
import {
  initialListingLimits,
  LISTING_FRESH_MS,
  LISTING_GROUPS,
  LISTING_REFRESH_WINDOW,
  SAVED_LISTING_LIMIT,
  listingComplete,
  nextListingLimits,
  validListingBatch,
  validPersonalListing,
  type ListingBatch,
  type ListingLimits,
  type PersonalListing,
  type TrackedListing,
  type TrackedListingHistory,
} from "../kosmora/my-listings";

export const LISTING_PRICE_KEY = "kosmore.myListingPrices";
export const LISTING_SESSION_PREFIX = "kosmore.listingHistory.";
export type HistoryMode = "more" | "refresh";
export type ListingReader = (
  limits: ListingLimits,
  signal: AbortSignal,
) => Promise<ListingBatch>;
interface Store {
  get(key: string | string[] | null): Promise<Record<string, unknown>>;
  set(data: Record<string, unknown>): Promise<void>;
  remove(key: string | string[]): Promise<void>;
}
interface Tracked extends TrackedListingHistory {
  v: 2;
  complete: boolean;
  pruned: boolean;
  checkedAt: number;
}
interface Pending {
  limits: ListingLimits;
  started: boolean;
  controller: AbortController;
  users: number;
  readers: Map<ListingReader, number>;
  promise: Promise<ListingBatch>;
}
const fresh = (time: number) =>
  time > 0 && Date.now() - time < LISTING_FRESH_MS;
const covers = (batch: ListingBatch, limits: ListingLimits) =>
  LISTING_GROUPS.every(
    (group) =>
      batch.counts[group] >= batch.totals[group] ||
      batch.limits[group] >= limits[group],
  );
const abortError = () =>
  new DOMException("Listing lookup canceled.", "AbortError");

/** The list is stored in newest-known order, with the proven latest row first. */
function mergeServerRows(
  previous: TrackedListing[],
  incoming: TrackedListing[],
) {
  const byId = new Map(incoming.map((row) => [row.id, row]));
  const saved = new Map(previous.map((row) => [row.id, row]));
  const before = new Map<string, TrackedListing[]>();
  let tail: TrackedListing[] = [];
  for (const row of previous) {
    if (byId.has(row.id)) {
      before.set(row.id, tail);
      tail = [];
    } else tail.push(row);
  }
  if (!before.size) return [...previous, ...incoming];
  const merged: TrackedListing[] = [];
  for (const row of incoming) {
    for (const earlier of before.get(row.id) ?? []) merged.push(earlier);
    const known = saved.get(row.id);
    merged.push({
      ...known,
      ...row,
      startPrice: known?.startPrice ?? row.startPrice,
    });
  }
  return merged.concat(tail);
}

export class ListingCacheService {
  private writes: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Pending>();
  private epochs = new Map<string, number>();
  private legacyIndex?: Promise<
    { entries?: Record<string, unknown> } | undefined
  >;
  constructor(
    private local: Store,
    private session: Store,
  ) {}
  private write<T>(work: () => Promise<T>): Promise<T> {
    const result = this.writes.then(work);
    this.writes = result.catch(() => {});
    return result;
  }
  private key(account: string, subject: string) {
    return `kosmore.listingRecord.${account}.${subject}`;
  }
  private decode(raw: unknown, legacy: unknown, subject: string): Tracked {
    const previous = raw as
      | (Tracked & {
          latest?: RecordedListing;
          verifiedId?: string;
          verifiedPrice?: string;
          reconciledAt?: number;
        })
      | undefined;
    if (previous?.v === 2 && Array.isArray(previous.listings)) return previous;
    const state: Tracked = {
      v: 2,
      listings: [],
      complete: false,
      pruned: false,
      hasMore: true,
      checkedAt: 0,
    };
    if (
      previous &&
      validRecordedListing(previous.latest) &&
      previous.latest.subjectId === subject
    ) {
      const { id, startPrice, submittedAt } = previous.latest;
      state.listings.push({ id, startPrice, submittedAt });
      if (
        previous.verifiedId &&
        previous.verifiedId !== id &&
        previous.verifiedPrice
      )
        state.listings.unshift({
          id: previous.verifiedId,
          startPrice: previous.verifiedPrice,
        });
      state.checkedAt = previous.reconciledAt ?? 0;
    } else {
      const entry = legacy as { listing?: unknown } | undefined;
      if (
        validPersonalListing(entry?.listing) &&
        entry.listing.subjectId === subject
      )
        state.listings.push(this.serverRow(entry.listing));
    }
    return state;
  }
  private async readTracked(account: string, subjects: string[]) {
    const keys = subjects.map((subject) => this.key(account, subject));
    const data = await this.local.get(keys);
    const legacy = keys.some((key) => data[key] === undefined)
      ? await (this.legacyIndex ??= this.local
          .get(LISTING_PRICE_KEY)
          .then(
            (data) =>
              data[LISTING_PRICE_KEY] as
                { entries?: Record<string, unknown> } | undefined,
          )
          .catch(() => {
            this.legacyIndex = undefined;
            return undefined;
          }))
      : undefined;
    return subjects.map((subject, i) =>
      this.decode(
        data[keys[i]],
        legacy?.entries?.[`${account}:${subject}`],
        subject,
      ),
    );
  }
  async tracked(
    account: string,
    subject: string,
  ): Promise<TrackedListingHistory> {
    await this.writes;
    const [state] = await this.readTracked(account, [subject]);
    return { listings: state.listings, hasMore: state.hasMore };
  }
  private saveState(
    state: Tracked,
    listings: TrackedListing[],
    complete = state.complete,
    checkedAt = state.checkedAt,
  ): Tracked {
    const pruned = state.pruned || listings.length > SAVED_LISTING_LIMIT;
    return {
      v: 2,
      listings: listings.slice(0, SAVED_LISTING_LIMIT),
      complete,
      pruned,
      hasMore: !complete || pruned,
      checkedAt,
    };
  }
  private serverRow({
    id,
    startPrice,
    endsAt,
    finish,
    state,
  }: PersonalListing): TrackedListing {
    return { id, startPrice, endsAt, finish, state };
  }
  async record(account: string, records: RecordedListing[]) {
    const groups = new Map<string, RecordedListing[]>();
    for (const row of records) {
      const group = groups.get(row.subjectId) ?? [];
      group.push(row);
      groups.set(row.subjectId, group);
    }
    if (!groups.size) return;
    await this.write(async () => {
      const subjects = [...groups.keys()];
      const states = await this.readTracked(account, subjects);
      const updates: Record<string, Tracked> = {};
      for (const [i, subject] of subjects.entries()) {
        const state = states[i],
          rows = [...state.listings];
        for (const { id, startPrice, submittedAt } of groups.get(subject)!) {
          const existing = rows.findIndex((row) => row.id === id);
          if (existing >= 0) {
            rows[existing] = {
              ...rows[existing],
              submittedAt: rows[existing].submittedAt ?? submittedAt,
            };
            continue;
          }
          const newer = submittedAt > (rows[0]?.submittedAt ?? state.checkedAt);
          const index = rows.findIndex(
            (row) =>
              row.submittedAt !== undefined && row.submittedAt < submittedAt,
          );
          rows.splice(newer ? 0 : index > 0 ? index : rows.length, 0, {
            id,
            startPrice,
            submittedAt,
          });
        }
        updates[this.key(account, subject)] = this.saveState(state, rows);
      }
      await this.local.set(updates);
    });
  }
  private async importRows(
    account: string,
    groups: Map<string, PersonalListing[]>,
    startedAt: number,
    complete: boolean,
    signal: AbortSignal,
  ) {
    if (!groups.size) return;
    await this.write(async () => {
      signal.throwIfAborted();
      const subjects = [...groups.keys()];
      const states = await this.readTracked(account, subjects);
      const updates: Record<string, Tracked> = {};
      for (const [i, subject] of subjects.entries()) {
        const state = states[i];
        const incoming = groups.get(subject)!.map((row) => this.serverRow(row));
        const rows = mergeServerRows(state.listings, incoming);
        const latest = state.listings[0];
        // A shared ID proves the server's relative ordering. An older or
        // unanchored scan can add rows but cannot replace a known latest row.
        const promote =
          !latest ||
          (incoming.some((row) => row.id === latest.id) &&
            startedAt >= (latest.submittedAt ?? state.checkedAt));
        const latestId = promote ? (incoming[0]?.id ?? latest?.id) : latest.id;
        const position = rows.findIndex((row) => row.id === latestId);
        if (position > 0) rows.unshift(...rows.splice(position, 1));
        updates[this.key(account, subject)] = this.saveState(
          state,
          rows,
          complete,
          promote ? Math.max(startedAt, state.checkedAt) : state.checkedAt,
        );
      }
      signal.throwIfAborted();
      await this.local.set(updates);
    });
  }
  async history(
    account: string,
    subject: string,
    mode: HistoryMode,
    read: ListingReader,
    signal: AbortSignal,
    requested?: ListingLimits,
  ) {
    const startedAt = Date.now();
    const previous = await this.batch(account);
    signal.throwIfAborted();
    const refresh = mode === "refresh";
    const usable = previous && fresh(previous.fetchedAt) ? previous : undefined;
    const limits = refresh
      ? {
          selling: LISTING_REFRESH_WINDOW,
          sold: LISTING_REFRESH_WINDOW,
          unsold: LISTING_REFRESH_WINDOW,
        }
      : (requested ??
        (usable ? nextListingLimits(usable) : initialListingLimits()));
    const batch = await this.ensure(
      account,
      limits,
      read,
      signal,
      refresh || (!!previous && !usable),
    );
    if (
      refresh &&
      LISTING_GROUPS.some(
        (group) =>
          batch.counts[group] <
          Math.min(batch.totals[group], LISTING_REFRESH_WINDOW),
      )
    )
      throw new Error(
        "Your listing history stopped before the newest auctions were returned.",
      );
    const groups = new Map<string, PersonalListing[]>();
    const complete =
      listingComplete(batch) &&
      (!refresh || batch.listings.length <= LISTING_REFRESH_WINDOW);
    groups.set(subject, []);
    const window = refresh
      ? batch.listings.slice(0, LISTING_REFRESH_WINDOW)
      : batch.listings;
    for (const row of window) {
      if (!refresh && row.subjectId !== subject) continue;
      const rows = groups.get(row.subjectId) ?? [];
      rows.push(row);
      groups.set(row.subjectId, rows);
    }
    await this.importRows(
      account,
      groups,
      batch.startedAt ?? Math.min(startedAt, batch.fetchedAt),
      complete,
      signal,
    );
    return refresh ? undefined : { ...batch, listings: groups.get(subject)! };
  }
  async invalidate(account: string) {
    // A new confirmation invalidates reusable scan coverage. In-flight
    // scans can still merge with it using the serialized reconciliation.
    this.epochs.set(account, (this.epochs.get(account) ?? 0) + 1);
    await this.write(async () => {
      const key = LISTING_SESSION_PREFIX + account;
      const data = await this.session.get(key);
      if (validListingBatch(data[key]))
        await this.session.set({ [key]: { ...data[key], fetchedAt: 0 } });
    });
  }
  private async saveBatch(account: string, batch: ListingBatch, epoch: number) {
    await this.write(async () => {
      if (this.epochs.get(account) !== epoch) return;
      // Normalized snapshots only. Evict old accounts before approaching session storage's quota.
      const data = await this.session.get(null);
      const key = LISTING_SESSION_PREFIX + account;
      const keys = Object.keys(data).filter((key) =>
        key.startsWith(LISTING_SESSION_PREFIX),
      );
      let bytes = JSON.stringify(batch).length * 2;
      if (bytes > 6_000_000) return; // Large results remain usable by the current consumers.
      const victims = keys
        .filter((k) => k !== key)
        .sort(
          (a, b) =>
            Number((data[a] as ListingBatch)?.fetchedAt ?? 0) -
            Number((data[b] as ListingBatch)?.fetchedAt ?? 0),
        );
      bytes += victims.reduce(
        (sum, k) => sum + JSON.stringify(data[k]).length * 2,
        0,
      );
      const remove: string[] = [];
      while (bytes > 6_000_000 && victims.length) {
        const k = victims.shift()!;
        bytes -= JSON.stringify(data[k]).length * 2;
        remove.push(k);
      }
      if (remove.length) await this.session.remove(remove);
      await this.session.set({ [key]: batch });
    });
  }
  private async batch(account: string) {
    await this.writes;
    const key = LISTING_SESSION_PREFIX + account;
    const raw = (await this.session.get(key))[key];
    return validListingBatch(raw) ? raw : undefined;
  }
  private async ensure(
    account: string,
    limits: ListingLimits,
    read: ListingReader,
    signal: AbortSignal,
    force = false,
  ): Promise<ListingBatch> {
    signal.throwIfAborted();
    if (!this.epochs.has(account)) this.epochs.set(account, 0);
    for (;;) {
      const epoch = this.epochs.get(account)!;
      if (!force) {
        const raw = await this.batch(account);
        signal.throwIfAborted();
        if (raw && fresh(raw.fetchedAt) && covers(raw, limits)) return raw;
      }
      let job = this.pending.get(account);
      if (!job || job.controller.signal.aborted) {
        job = {
          limits: { ...limits },
          started: false,
          controller: new AbortController(),
          users: 0,
          readers: new Map(),
          promise: Promise.resolve(undefined!),
        };
        const active = job;
        this.pending.set(account, active);
        active.promise = Promise.resolve().then(async () => {
          active.controller.signal.throwIfAborted();
          active.started = true;
          const startedAt = Date.now();
          const attempted = new Set<ListingReader>();
          let result: ListingBatch | undefined;
          for (;;) {
            const transport = [...active.readers.keys()].find(
              (reader) => !attempted.has(reader),
            );
            if (!transport)
              throw new Error(
                "The game tab closed during the listing lookup. Try again.",
              );
            attempted.add(transport);
            try {
              result = await transport(active.limits, active.controller.signal);
              break;
            } catch (error) {
              if (
                active.controller.signal.aborted ||
                !/Receiving end|port closed|tab.*closed|No tab/i.test(
                  String(error),
                )
              )
                throw error;
            }
          }
          if (!result || !validListingBatch(result))
            throw new Error("Your listing history is unavailable.");
          active.controller.signal.throwIfAborted();
          result = { ...result, startedAt };
          const previous = await this.batch(account);
          if (previous && result.fetchedAt <= previous.fetchedAt)
            result = { ...result, fetchedAt: previous.fetchedAt + 1 };
          if (previous && fresh(previous.fetchedAt))
            for (const group of LISTING_GROUPS) {
              if (
                active.limits[group] > previous.limits[group] &&
                result.counts[group] <= previous.counts[group] &&
                result.counts[group] < result.totals[group]
              )
                throw new Error(
                  "Your listing history stopped before all auctions were returned.",
                );
            }
          await this.saveBatch(account, result, epoch);
          return result;
        });
        const cleanup = () => {
          if (this.pending.get(account) === active)
            this.pending.delete(account);
        };
        void active.promise.then(cleanup, cleanup);
      } else if (!job.started)
        for (const group of LISTING_GROUPS)
          job.limits[group] = Math.max(job.limits[group], limits[group]);
      const result = await this.consume(job, read, signal);
      signal.throwIfAborted();
      if (covers(result, limits)) return result;
      force = false;
    }
  }
  private consume(
    job: Pending,
    read: ListingReader,
    signal: AbortSignal,
  ): Promise<ListingBatch> {
    job.users++;
    job.readers.set(read, (job.readers.get(read) ?? 0) + 1);
    return new Promise((resolve, reject) => {
      let finished = false;
      const release = () => {
        if (finished) return false;
        finished = true;
        signal.removeEventListener("abort", cancel);
        job.users--;
        const count = job.readers.get(read)! - 1;
        if (count) job.readers.set(read, count);
        else job.readers.delete(read);
        if (!job.users) job.controller.abort();
        return true;
      };
      const cancel = () => {
        if (release()) reject(abortError());
      };
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) {
        cancel();
        return;
      }
      void job.promise.then(
        (result) => {
          if (release()) resolve(result);
        },
        (error) => {
          if (release()) reject(error);
        },
      );
    });
  }
}
