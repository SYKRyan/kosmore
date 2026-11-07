import {
  initialListingLimits,
  LISTING_FRESH_MS,
  LISTING_GROUPS,
  listingComplete,
  nextListingLimits,
  unresolvedListingGroups,
  validListingBatch,
  validPersonalListing,
  type ListingBatch,
  type ListingCache,
  type ListingLimits,
  type LatestListing,
} from "../kosmora/my-listings";

export const LISTING_PRICE_KEY = "kosmore.myListingPrices";
export const LISTING_SESSION_PREFIX = "kosmore.listingHistory.";
export type HistoryMode = "initial" | "more" | "refresh";
export type ListingReader = (
  limits: ListingLimits,
  signal: AbortSignal,
) => Promise<ListingBatch>;
interface Store {
  get(key: string | null): Promise<Record<string, unknown>>;
  set(data: Record<string, unknown>): Promise<void>;
  remove(key: string | string[]): Promise<void>;
}
interface PriceEntry extends LatestListing {
  usedAt: number;
}
interface Index {
  v: 1;
  entries: Record<string, PriceEntry>;
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

/** Session history and a bounded, persistent latest-price index. Only explicit consumers start reads. */
export class ListingCacheService {
  private writes: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Pending>();
  private epochs = new Map<string, number>();
  constructor(
    private local: Store,
    private session: Store,
  ) {}
  private write<T>(work: () => Promise<T>): Promise<T> {
    const result = this.writes.then(work);
    this.writes = result.catch(() => {});
    return result;
  }
  private async index(): Promise<Index> {
    const raw = (await this.local.get(LISTING_PRICE_KEY))[LISTING_PRICE_KEY] as
      Index | undefined;
    const index: Index = { v: 1, entries: {} };
    if (raw?.v === 1 && raw.entries && typeof raw.entries === "object")
      for (const [key, value] of Object.entries(raw.entries)) {
        if (
          !/^[a-z0-9_]{1,24}:\d+$/.test(key) ||
          !value ||
          !Number.isFinite(value.checkedAt) ||
          value.checkedAt < 0 ||
          !Number.isFinite(value.usedAt)
        )
          continue;
        if (
          value.listing !== null &&
          (!validPersonalListing(value.listing) ||
            value.listing.subjectId !== key.split(":")[1])
        )
          continue;
        index.entries[key] = value;
      }
    return index;
  }
  async cached(
    account: string,
    subject: string,
    touch = true,
  ): Promise<ListingCache> {
    return this.write(async () => {
      const index = await this.index(),
        key = `${account}:${subject}`,
        latest = index.entries[key];
      if (latest && touch) {
        latest.usedAt = Date.now();
        await this.local.set({ [LISTING_PRICE_KEY]: index });
      }
      const raw = (await this.session.get(LISTING_SESSION_PREFIX + account))[
        LISTING_SESSION_PREFIX + account
      ];
      return {
        ...(validListingBatch(raw) ? { batch: raw } : {}),
        ...(latest
          ? { latest: { listing: latest.listing, checkedAt: latest.checkedAt } }
          : {}),
      };
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
  private async savePrice(
    account: string,
    subject: string,
    result: LatestListing,
    epoch: number,
  ) {
    await this.write(async () => {
      if (this.epochs.get(account) !== epoch) return;
      const index = await this.index();
      index.entries[`${account}:${subject}`] = {
        ...result,
        usedAt: Date.now(),
      };
      const keys = Object.keys(index.entries).sort(
        (a, b) => index.entries[a].usedAt - index.entries[b].usedAt,
      );
      for (const key of keys.slice(0, Math.max(0, keys.length - 10_000)))
        delete index.entries[key];
      await this.local.set({ [LISTING_PRICE_KEY]: index });
    });
  }
  async invalidate(account: string) {
    this.epochs.set(account, (this.epochs.get(account) ?? 0) + 1);
    this.pending.get(account)?.controller.abort();
    this.pending.delete(account);
    await this.write(async () => {
      const index = await this.index();
      for (const [key, value] of Object.entries(index.entries))
        if (key.startsWith(`${account}:`)) value.checkedAt = 0;
      await this.local.set({ [LISTING_PRICE_KEY]: index });
      const key = LISTING_SESSION_PREFIX + account,
        data = await this.session.get(key);
      if (validListingBatch(data[key]))
        await this.session.set({
          [key]: { ...(data[key] as ListingBatch), fetchedAt: 0 },
        });
    });
  }
  async history(
    account: string,
    subject: string,
    mode: HistoryMode,
    read: ListingReader,
    signal: AbortSignal,
    requested?: ListingLimits,
  ): Promise<ListingBatch> {
    const cached = await this.cached(account, subject);
    signal.throwIfAborted();
    const batch = cached.batch;
    if (mode === "initial" && batch && fresh(batch.fetchedAt)) return batch;
    if (
      mode === "more" &&
      batch &&
      listingComplete(batch) &&
      fresh(batch.fetchedAt)
    )
      return batch;
    const limits =
      mode === "more" && requested
        ? requested
        : mode === "more" && batch
          ? nextListingLimits(batch)
          : initialListingLimits();
    return this.ensure(
      account,
      limits,
      read,
      signal,
      mode === "refresh" || (!!batch && !fresh(batch.fetchedAt)),
    );
  }
  async latest(
    account: string,
    subject: string,
    read: ListingReader,
    signal: AbortSignal,
  ): Promise<LatestListing> {
    const cached = await this.cached(account, subject);
    signal.throwIfAborted();
    if (
      cached.latest &&
      fresh(cached.latest.checkedAt) &&
      (!cached.batch || cached.batch.fetchedAt <= cached.latest.checkedAt)
    )
      return cached.latest;
    const epoch = this.epochs.get(account) ?? 0;
    this.epochs.set(account, epoch);
    let batch = cached.batch;
    if (!batch || !fresh(batch.fetchedAt))
      batch = await this.ensure(
        account,
        initialListingLimits(),
        read,
        signal,
        !!batch,
      );
    for (;;) {
      signal.throwIfAborted();
      if (this.epochs.get(account) !== epoch) throw abortError();
      const groups = unresolvedListingGroups(batch, subject);
      if (!groups.length) {
        const result = {
          listing:
            batch.listings.find((item) => item.subjectId === subject) ?? null,
          checkedAt: batch.fetchedAt,
        };
        await this.savePrice(account, subject, result, epoch);
        if (signal.aborted || this.epochs.get(account) !== epoch)
          throw abortError();
        return result;
      }
      batch = await this.ensure(
        account,
        nextListingLimits(batch, groups),
        read,
        signal,
      );
    }
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
          if (
            this.epochs.get(account) !== epoch ||
            active.controller.signal.aborted
          )
            throw abortError();
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
      if (this.epochs.get(account) !== epoch) throw abortError();
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
