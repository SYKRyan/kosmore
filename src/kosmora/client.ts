import { validRecordedListing, type RecordedListing } from "./listing-capture";
import { ReadCache } from "../shared/cache";
import {
  RequestScheduler,
  requestPriority,
  setRequestPriority,
} from "../shared/request-scheduler";
import { parseFamilyChoices } from "./families";
import {
  parseFamilyCounts,
  parseFamilyCountsPage,
  parseMilestones,
} from "./fusion";
import { parseFriends } from "./friends";
import { parseQuestSubjects } from "./quests";
import {
  parseInterestPage,
  interestCounts,
  type InterestEntry,
} from "./trade-interest";
import { activeAuctionSummary, type AuctionListing } from "./auctions";
import {
  listingPath,
  parseListingBatch,
  type ListingBatch,
  type TrackedListing,
  type TrackedListingHistory,
  type ListingLimits,
} from "./my-listings";
import type { HistoryMode } from "../shared/listing-cache";
import type { Result } from "../shared/messages";
import type {
  Account,
  Album,
  CardContext,
  KosmoraClient,
  OpeningCard,
  OwnedCopy,
  Finish,
  MarketHistory,
} from "../shared/types";
import {
  amount,
  count,
  object,
  parseAccount,
  parseAlbums,
  parseHistory,
  parseInsights,
  parseOpening,
  parseReadyPackIds,
  subjectId,
  uuid,
} from "./contracts";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public retryAt = 0,
    public rateLimitRequestStartedAt = 0,
  ) {
    super(message);
  }
}
export class GameClient implements KosmoraClient {
  private reads = new ReadCache(40, 300_000);
  private cardReads = new ReadCache(150, 30_000);
  private priceReads = new ReadCache(450, 300_000);
  private albumReads = new ReadCache(100, 10_000);
  private packReads = new ReadCache(1, 30_000);
  private nativePackIds?: { ids: string[]; at: number };
  private consumedPacks = new Set<string>();
  private nativeOpenings = new Map<string, OpeningCard[]>();
  private openingReads = new ReadCache(40, 30_000);
  private accountReads = new ReadCache(1, 2_000);
  private auctionReads = new ReadCache(100, 60_000);
  private auctionPresenceReads = new ReadCache(100, 60_000);
  private historyPresenceReads = new ReadCache(450, 300_000);
  private marketPages = new ReadCache(0, 0);
  private auctionProgress = new Map<string, Set<() => void>>();
  private listingDetailReads = new ReadCache(256, 300_000);
  private listingListenersChanged = new Set<() => void>();
  private collectionReads = new ReadCache(60, 30_000);
  private familyCountReads = new ReadCache(40, 300_000);
  private scheduler = new RequestScheduler(3);
  private accountVersion = 0;
  private collectSaleRateData = true;
  private saleRateEpoch = 0;
  private collectionAbort = new AbortController();
  private accountListeners = new Set<() => void>();
  private listingListeners = new Set<(listings: AuctionListing[]) => void>();
  private historyListeners = new Set<
    (subjectId: string, history: MarketHistory, loadedAt: number) => void
  >();
  private lastAccount?: Account;
  private accountVerifiedSince = 0;
  private blockedUntil = 0;
  private rateLimitRequestStartedAt = 0;
  private writes = new Set<string>();
  constructor(
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}
  onAccountChange(listener: () => void) {
    this.accountListeners.add(listener);
  }
  setSaleRateCollection(enabled: boolean) {
    if (this.collectSaleRateData === enabled) return;
    this.collectSaleRateData = enabled;
    this.saleRateEpoch++;
    this.collectionAbort.abort();
    this.collectionAbort = new AbortController();
    this.auctionPresenceReads.clear();
  }
  /** Price histories as they arrive from the network (not cache hits), with fetch time. */
  onHistoryLoaded(
    listener: (
      subjectId: string,
      history: MarketHistory,
      loadedAt: number,
    ) => void,
  ) {
    this.historyListeners.add(listener);
    return () => this.historyListeners.delete(listener);
  }
  /** Open listings seen by auction searches, for local sale-rate observations. */
  onAuctionListings(listener: (listings: AuctionListing[]) => void) {
    this.listingListeners.add(listener);
    return () => this.listingListeners.delete(listener);
  }
  private clearPrivateReads() {
    this.accountVersion++;
    this.nativePackIds = undefined;
    this.nativeOpenings.clear();
    this.consumedPacks.clear();
    for (const cache of [
      this.reads,
      this.cardReads,
      this.priceReads,
      this.albumReads,
      this.openingReads,
      this.packReads,
      this.auctionReads,
      this.auctionPresenceReads,
      this.historyPresenceReads,
      this.marketPages,
      this.listingDetailReads,
      this.collectionReads,
      this.familyCountReads,
    ])
      cache.clear();
  }
  private cached<T>(
    cache: ReadCache,
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    fresh = false,
    paths: string[] = [],
  ) {
    const scopedKey = `${this.lastAccount?.key}:${key}`;
    const priority = requestPriority(signal);
    if (priority !== "background") {
      const pending = cache.pendingSignal(scopedKey);
      if (pending && requestPriority(pending) !== "interactive")
        setRequestPriority(pending, priority);
      for (const path of paths) this.scheduler.promote(path, priority);
    }
    const version = this.accountVersion;
    return cache.get(
      scopedKey,
      async (shared) => {
        setRequestPriority(shared, requestPriority(signal));
        const result = await load(shared);
        if (version !== this.accountVersion)
          throw new DOMException(
            "Your Kosmora account changed. Reopen the popup.",
            "AbortError",
          );
        return result;
      },
      fresh,
      signal,
    );
  }
  private async read(path: string, signal?: AbortSignal) {
    const shared = signal ?? new AbortController().signal;
    return this.scheduler.run(path, shared, () =>
      this.send(path, "GET", undefined, shared),
    );
  }
  private async send(
    path: string,
    method: "GET" | "POST" | "DELETE",
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const startedAt = Date.now();
    if (startedAt < this.blockedUntil)
      throw new ApiError(
        "Kosmora is rate limiting requests. Try again shortly.",
        429,
        this.blockedUntil,
        this.rateLimitRequestStartedAt,
      );
    const timeout = AbortSignal.timeout(15_000),
      combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const r = await this.fetcher(`/api${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: combined,
      headers:
        method !== "GET"
          ? {
              Accept: "application/json",
              "Content-Type": "application/json",
              "x-kosmora": "1",
            }
          : { Accept: "application/json" },
      // The native transport sends valid JSON for every write, including DELETE.
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    const data: unknown = await r.json().catch(() => null);
    if (r.status === 429) {
      this.rateLimitRequestStartedAt = startedAt;
      const retry = Number(r.headers.get("Retry-After"));
      this.blockedUntil =
        Date.now() +
        (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 300) : 30) *
          1000;
    }
    if (!r.ok) {
      if (r.status === 401) {
        const hadAccount = !!this.lastAccount;
        this.lastAccount = undefined;
        this.accountReads.clear();
        this.clearPrivateReads();
        if (hadAccount)
          for (const listener of this.accountListeners) listener();
      }
      throw new ApiError(
        r.status === 401
          ? "Sign in to Kosmora to continue."
          : r.status === 429
            ? "Kosmora is rate limiting requests. Try again shortly."
            : r.status === 404
              ? "This card or album is no longer available."
              : `Kosmora could not complete the request (${r.status}).`,
        r.status,
        r.status === 429 ? this.blockedUntil : 0,
        r.status === 429 ? startedAt : 0,
      );
    }
    return data;
  }
  async account(signal?: AbortSignal, fresh = true): Promise<Account> {
    const priority = requestPriority(signal);
    if (priority !== "background") {
      const pending = this.accountReads.pendingSignal("account");
      if (pending && requestPriority(pending) !== "interactive")
        setRequestPriority(pending, priority);
      this.scheduler.promote("/me", priority);
    }
    return this.accountReads.get(
      "account",
      async (shared) => {
        setRequestPriority(shared, requestPriority(signal));
        const version = this.accountVersion;
        const next = parseAccount(await this.read("/me", shared));
        if (version !== this.accountVersion)
          throw new DOMException(
            "The account session changed while it was loading.",
            "AbortError",
          );
        const changed = !!this.lastAccount && next.key !== this.lastAccount.key;
        if (next.key !== this.lastAccount?.key) {
          this.clearPrivateReads();
          this.accountVerifiedSince = Date.now();
        }
        this.lastAccount = next;
        if (changed) for (const listener of this.accountListeners) listener();
        return next;
      },
      fresh && !this.accountReads.hasPending("account"),
      signal,
    );
  }
  insights(id: string, signal?: AbortSignal, fresh = false) {
    id = subjectId(id);
    const path = `/collection/${id}`;
    return this.cached(
      this.cardReads,
      `card:${id}`,
      async (shared) => parseInsights(await this.read(path, shared)),
      signal,
      fresh,
      [path],
    );
  }
  async activeAuctions(
    id: string,
    name: string,
    signal?: AbortSignal,
    fresh = false,
    onMatch?: () => void,
  ) {
    return (
      await this.auctionSummary(id, name, signal, fresh, "full", onMatch)
    ).count;
  }
  onListingsChanged(listener: () => void) {
    this.listingListenersChanged.add(listener);
  }
  listingsChanged(account: string) {
    if (account === this.lastAccount?.key)
      for (const listener of this.listingListenersChanged) listener();
  }
  async cachedListings(
    id: string,
    signal?: AbortSignal,
  ): Promise<TrackedListingHistory> {
    const account = await this.account(signal, false);
    return this.listingRequest(
      "listingCache",
      account.key,
      subjectId(id),
      signal,
    );
  }
  async listingHistory(
    id: string,
    mode: HistoryMode,
    signal?: AbortSignal,
    limits?: ListingLimits,
  ): Promise<ListingBatch | undefined> {
    const account = await this.account(signal);
    return this.listingRequest(
      "listingHistory",
      account.key,
      subjectId(id),
      signal,
      { mode, limits },
    );
  }
  async latestListing(
    id: string,
    signal?: AbortSignal,
  ): Promise<TrackedListing | undefined> {
    const account = await this.account(signal, false);
    return this.listingRequest(
      "listingSavedPrice",
      account.key,
      subjectId(id),
      signal,
    );
  }

  async captureListings(confirmations: unknown) {
    const previous = this.lastAccount;
    const account = await this.account();
    const version = this.accountVersion;
    if (previous && previous.key !== account.key) return;
    const records: RecordedListing[] = [];
    const seen = new Set<string>();
    const rows = Array.isArray(confirmations)
      ? confirmations.slice(0, 500)
      : [];
    const signal = setRequestPriority(
      new AbortController().signal,
      "background",
    );
    for (const raw of rows) {
      try {
        const row = object(raw);
        const id = uuid(row.auctionId).toLowerCase();
        if (
          seen.has(id) ||
          typeof row.submittedAt !== "number" ||
          row.submittedAt > Date.now() ||
          row.submittedAt < Date.now() - 300_000
        )
          continue;
        seen.add(id);
        let record = {
          id,
          subjectId: row.subjectId,
          startPrice: row.startPrice,
          submittedAt: row.submittedAt,
        };
        if (
          !previous ||
          row.submittedAt < this.accountVerifiedSince ||
          !validRecordedListing(record)
        ) {
          const path = `/auctions/${id}`;
          const detail = await this.cached(
            this.listingDetailReads,
            id,
            (shared) => this.read(path, shared).catch(() => undefined),
            signal,
            false,
            [path],
          );
          const data = object(detail);
          const auction = object(data.auction ?? data);
          if (
            uuid(auction.id).toLowerCase() !== id ||
            auction.yours === false ||
            typeof auction.seller !== "string" ||
            auction.seller.toLowerCase() !== account.key
          )
            continue;
          record = {
            id,
            subjectId: subjectId(object(auction.card).subjectId),
            startPrice: amount(auction.startPrice),
            submittedAt: row.submittedAt,
          };
        }
        if (validRecordedListing(record)) records.push(record);
      } catch {
        // An unresolved submission remains eligible for a later history check.
      }
      if (version !== this.accountVersion) return;
    }
    if (version !== this.accountVersion) return;
    if (records.length)
      await this.listingRequest("listingRecord", account.key, "0", undefined, {
        records,
      });
    else await this.listingRequest("listingInvalidate", account.key, "0");
  }

  async readListingBatch(
    account: string,
    limits: ListingLimits,
    signal: AbortSignal,
  ) {
    if ((await this.account(signal)).key !== account)
      throw new Error("Your Kosmora account changed. Reopen the popup.");
    const version = this.accountVersion;
    const batch = parseListingBatch(
      await this.read(listingPath(limits), signal),
      account,
      limits,
    );
    signal.throwIfAborted();
    if (this.accountVersion !== version)
      throw new DOMException(
        "Your Kosmora account changed. Reopen the popup.",
        "AbortError",
      );
    return batch;
  }
  private async listingRequest<T>(
    op: string,
    accountKey: string,
    id: string,
    signal?: AbortSignal,
    extra = {},
  ): Promise<T> {
    signal?.throwIfAborted();
    const version = this.accountVersion,
      requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const cancel = () => {
        void chrome.runtime
          .sendMessage({
            requestId: crypto.randomUUID(),
            op: "listingCancel",
            target: requestId,
          })
          .catch(() => {});
        reject(
          signal?.reason ??
            new DOMException("Listing lookup canceled.", "AbortError"),
        );
      };
      signal?.addEventListener("abort", cancel, { once: true });
      void chrome.runtime
        .sendMessage({ requestId, op, accountKey, subjectId: id, ...extra })
        .then((raw: unknown) => {
          if (signal?.aborted) return;
          if (version !== this.accountVersion)
            throw new DOMException(
              "Your Kosmora account changed. Reopen the popup.",
              "AbortError",
            );
          const result = raw as Result<T> & {
            status?: number;
            retryAt?: number;
          };
          if (!result || result.requestId !== requestId || !result.ok)
            throw new ApiError(
              result && !result.ok
                ? result.error
                : "Your listing history is unavailable.",
              result?.status,
              result?.retryAt,
            );
          resolve(result.data);
        })
        .catch(reject)
        .finally(() => signal?.removeEventListener("abort", cancel));
    });
  }
  async lowestListingPrice(
    id: string,
    name: string,
    signal?: AbortSignal,
    fresh = false,
  ) {
    return (await this.auctionSummary(id, name, signal, fresh)).lowestPrice;
  }
  async hasActiveAuctions(
    id: string,
    name: string,
    signal?: AbortSignal,
    onMatch?: () => void,
  ) {
    id = subjectId(id);
    const key = `${this.lastAccount?.key}:auctions:${id}:${name}`;
    const complete = this.auctionReads.peek<{ count: number }>(key);
    if (complete && !complete.stale) return complete.value.count > 0;
    const mode = this.auctionReads.hasPending(key)
      ? "full"
      : this.collectSaleRateData
        ? "observe"
        : "presence";
    return (
      (await this.auctionSummary(id, name, signal, false, mode, onMatch)).count > 0
    );
  }
  private marketPage(path: string, signal: AbortSignal, fresh: boolean) {
    return fresh
      ? this.read(path, signal)
      : this.cached(
          this.marketPages,
          path,
          (shared) => this.read(path, shared),
          signal,
          false,
          [path],
        );
  }
  private auctionSummary(
    id: string,
    name: string,
    signal?: AbortSignal,
    fresh = false,
    mode: "full" | "presence" | "observe" = "full",
    onMatch?: () => void,
  ) {
    id = subjectId(id);
    if (requestPriority(signal) !== "background")
      this.scheduler.promotePrefix(
        `/auctions?${new URLSearchParams({ q: name, sort: "ending" })}&`,
        requestPriority(signal),
      );
    const key = `${this.lastAccount?.key}:auctions:${id}:${name}`;
    const listeners = this.auctionProgress.get(key) ?? new Set<() => void>();
    if (onMatch) {
      listeners.add(onMatch);
      this.auctionProgress.set(key, listeners);
    }
    const result = this.cached(
      mode === "full" ? this.auctionReads : this.auctionPresenceReads,
      mode === "full"
        ? `auctions:${id}:${name}`
        : `auctions:${mode}:${id}:${name}`,
      (shared) => {
        const timeout = AbortSignal.timeout(15_000);
        const combined = AbortSignal.any([shared, timeout]);
        setRequestPriority(combined, requestPriority(shared));
        const epoch = this.saleRateEpoch;
        const collect = this.collectionAbort.signal;
        let matched = false;
        const keepObserving = () =>
          this.collectSaleRateData && epoch === this.saleRateEpoch;
        return activeAuctionSummary(
          id,
          name,
          (path) => {
            const readSignal =
              mode === "observe" && matched
                ? AbortSignal.any([combined, collect])
                : combined;
            const priority = requestPriority(shared);
            // Once the icon is known, remaining pages only refine the price.
            // An open tooltip can still promote the shared read.
            setRequestPriority(
              readSignal,
              mode === "full" &&
                onMatch &&
                matched &&
                priority !== "interactive"
                ? "background"
                : priority,
            );
            return this.marketPage(path, readSignal, fresh);
          },
          mode,
          () => {
            matched = true;
            for (const listener of this.auctionProgress.get(key) ?? [])
              listener();
          },
          keepObserving,
        )
          .catch((error) => {
            if (
              mode === "observe" &&
              matched &&
              collect.aborted &&
              !combined.aborted
            )
              return { count: 1, listings: [], lowestPrice: undefined };
            throw error;
          })
          .then((summary) => {
            if (!keepObserving() || shared.aborted || mode === "presence")
              return summary;
            for (const listener of this.listingListeners)
              try {
                listener(summary.listings);
              } catch {
                // Observation failures never affect the auction summary.
              }
            return summary;
          });
      },
      signal,
      fresh,
    );
    if (!onMatch) return result;
    return result.finally(() => {
      listeners.delete(onMatch);
      if (!listeners.size && this.auctionProgress.get(key) === listeners)
        this.auctionProgress.delete(key);
    });
  }
  families(signal?: AbortSignal, fresh = false) {
    return this.cached(
      this.reads,
      "family-choices",
      async (shared) =>
        parseFamilyChoices(await this.read("/atlas/families", shared)),
      signal,
      fresh,
      ["/atlas/families"],
    );
  }
  /** Serves a card's queued `/collection/{id}` read ahead of other queued reads. */
  expediteCard(id: string) {
    this.scheduler.expedite(`/collection/${subjectId(id)}`);
  }
  invalidateFamilyCounts() {
    this.familyCountReads.clear();
  }

  /** Cards collected per family, for fusion family impact. */
  familyCounts(signal?: AbortSignal, fresh = false) {
    const page = (offset: number) =>
      `/me/families?sort=closest&limit=1000${offset ? `&offset=${offset}` : ""}`;
    return this.cached(
      this.familyCountReads,
      "family-counts",
      async (shared) => {
        // Kosmora returns at most 1000 families per read; page through the rest.
        const counts = new Map<string, number>();
        for (let offset = 0; offset < 20_000; offset += 1000) {
          const next = parseFamilyCountsPage(
            await this.read(page(offset), shared),
          );
          for (const [id, n] of next.counts) counts.set(id, n);
          if (next.counts.size < 1000 || counts.size >= next.total) break;
        }
        return counts;
      },
      signal,
      fresh,
      [page(0)],
    );
  }
  async familyCountsFor(ids: string[], signal?: AbortSignal, fresh = false) {
    const wanted = [...new Set(ids)].sort();
    const counts = new Map<string, number>();
    for (let offset = 0; offset < wanted.length; offset += 50) {
      const batch = wanted.slice(offset, offset + 50);
      const path =
        "/me/families?" +
        new URLSearchParams({
          tags: "1",
          ids: batch.join(","),
          limit: String(batch.length),
        });
      let scoped: Map<string, number>;
      try {
        scoped = await this.cached(
          this.familyCountReads,
          path,
          async (shared) => parseFamilyCounts(await this.read(path, shared)),
          signal,
          fresh,
          [path],
        );
      } catch (error) {
        if (
          signal?.aborted ||
          (error instanceof ApiError &&
            (error.status === 401 || error.status === 429))
        )
          throw error;
        return this.familyCounts(signal, fresh);
      }
      if (!batch.every((id) => scoped.has(id)))
        return this.familyCounts(signal, fresh);
      for (const id of batch) counts.set(id, scoped.get(id)!);
    }
    return counts;
  }

  /** Family tier thresholds, when the relay has not passed on the game's own read. */
  familyMilestones(signal?: AbortSignal) {
    return this.cached(
      this.reads,
      "family-milestones",
      async (shared) => parseMilestones(await this.read("/families", shared)),
      signal,
      false,
      ["/families"],
    );
  }
  async possibleInterest(
    familyIds: string[],
    signal?: AbortSignal,
    fresh = false,
  ) {
    const entries: InterestEntry[] = [];
    for (const family of new Set(familyIds)) {
      if (!family || family.length > 200)
        throw new Error("Invalid family identifier.");
      entries.push(
        ...(await this.cached(
          this.collectionReads,
          `interest:${family}`,
          async (shared) => {
            const rows: InterestEntry[] = [],
              cursors = new Set<string>();
            let cursor: string | null = null;
            do {
              const params = new URLSearchParams({
                family,
                split: "1",
                status: "available",
                sendable: "1",
                sort: "name",
                limit: "100",
              });
              if (cursor) params.set("cursor", cursor);
              const page = parseInterestPage(
                await this.read(`/collection?${params}`, shared),
              );
              rows.push(...page.items);
              cursor = page.cursor;
              if (cursor && (cursors.has(cursor) || rows.length >= 100_000))
                throw new Error(
                  "The complete collection could not be counted.",
                );
              if (cursor) cursors.add(cursor);
            } while (cursor);
            return rows;
          },
          signal,
          fresh,
        )),
      );
    }
    return interestCounts(entries);
  }
  friends(signal?: AbortSignal, fresh = false) {
    return this.cached(
      this.reads,
      "friends",
      async (shared) => parseFriends(await this.read("/friends", shared)),
      signal,
      fresh,
      ["/friends"],
    );
  }
  questSubjects(signal?: AbortSignal, fresh = false) {
    return this.cached(
      this.reads,
      "quest-subjects",
      async (shared) => parseQuestSubjects(await this.read("/quests", shared)),
      signal,
      fresh,
      ["/quests"],
    );
  }
  hasInteractiveReads() {
    return this.scheduler.hasInteractiveReads();
  }

  peekHistory(id: string, finish: Finish) {
    if (!this.lastAccount) return;
    return this.priceReads.peek<MarketHistory>(
      `${this.lastAccount.key}:prices:${subjectId(id)}:${finish}`,
    );
  }

  peekAuction(id: string, name: string) {
    if (!this.lastAccount) return;
    return this.auctionReads.peek<
      Awaited<ReturnType<typeof activeAuctionSummary>>
    >(`${this.lastAccount.key}:auctions:${subjectId(id)}:${name}`);
  }

  async hasSaleHistory(id: string, finish: Finish, signal?: AbortSignal) {
    id = subjectId(id);
    const key = `prices:${id}:${finish}`;
    const hit = this.peekHistory(id, finish);
    if (hit && !hit.stale) return hit.value.count > 0;
    if (
      this.collectSaleRateData ||
      this.priceReads.hasPending(`${this.lastAccount?.key}:${key}`)
    )
      return (await this.history(id, finish, signal)).count > 0;
    const path = `/cards/${id}/prices?finish=${finish}`;
    return this.cached(
      this.historyPresenceReads,
      key,
      async (shared) => {
        const history = object(
          object(await this.marketPage(path, shared, false)).prices,
        );
        if (history.days !== 30)
          throw new Error("The market reporting window changed.");
        return count(history.count) > 0;
      },
      signal,
      false,
      [path],
    );
  }
  history(id: string, finish: Finish, signal?: AbortSignal, fresh = false) {
    id = subjectId(id);
    const path = `/cards/${id}/prices?finish=${finish}`;
    return this.cached(
      this.priceReads,
      `prices:${id}:${finish}`,
      async (shared) => {
        const epoch = this.saleRateEpoch;
        const history = parseHistory(
          await this.marketPage(path, shared, fresh),
          finish,
        );
        if (
          !this.collectSaleRateData ||
          epoch !== this.saleRateEpoch ||
          shared.aborted
        )
          return history;
        const loadedAt = Date.now();
        for (const listener of this.historyListeners)
          try {
            listener(id, history, loadedAt);
          } catch {
            // Observation failures never affect the history read.
          }
        return history;
      },
      signal,
      fresh,
      [path],
    );
  }
  async receivePackData(value: unknown) {
    if (!this.lastAccount) await this.account(undefined, false);
    const data = object(value);
    if (
      data.kind === "inventory" &&
      Array.isArray(data.ids) &&
      typeof data.requestedAt === "number" &&
      data.requestedAt <= Date.now() &&
      Date.now() - data.requestedAt < 30_000 &&
      (!this.nativePackIds || data.requestedAt >= this.nativePackIds.at)
    ) {
      this.nativePackIds = {
        ids: data.ids.map((id) => uuid(id).toLowerCase()),
        at: data.requestedAt,
      };
    } else if (data.kind === "opened") {
      this.consumedPacks.add(uuid(data.id).toLowerCase());
      if (this.consumedPacks.size > 500)
        this.consumedPacks.delete(this.consumedPacks.values().next().value!);
    } else if (data.kind === "opening") {
      const cards = parseOpening(data.data);
      if (!cards.length) return;
      this.nativeOpenings.set(cards[0].openingId.toLowerCase(), cards);
      if (this.nativeOpenings.size > 60)
        this.nativeOpenings.delete(this.nativeOpenings.keys().next().value!);
    }
  }

  async readyPackIds(signal?: AbortSignal): Promise<string[]> {
    await this.account(signal, false);
    const ids =
      this.nativePackIds && Date.now() - this.nativePackIds.at < 30_000
        ? this.nativePackIds.ids
        : await this.cached(
            this.packReads,
            "ready-packs",
            async (shared) =>
              parseReadyPackIds(await this.read("/packs/inventory", shared)),
            signal,
            false,
            ["/packs/inventory"],
          );
    return ids.filter((id) => !this.consumedPacks.has(id));
  }
  async albums(
    id?: string,
    signal?: AbortSignal,
    fresh = false,
  ): Promise<Album[]> {
    const path = `/albums${id ? `?contains=${subjectId(id)}` : ""}`;
    return this.cached(
      this.albumReads,
      path,
      async (shared) => parseAlbums(await this.read(path, shared)),
      signal,
      fresh,
      [path],
    );
  }
  async resolveCopy(
    context: CardContext,
    copies: OwnedCopy[],
    signal?: AbortSignal,
  ): Promise<OwnedCopy | undefined> {
    if (context.copyId) return copies.find((c) => c.id === context.copyId);
    if (context.surface === "page" || !copies.length) return undefined;
    const ids = context.openingIds.length
      ? context.openingIds
      : this.lastAccount?.currentOpeningId
        ? [this.lastAccount.currentOpeningId]
        : [];
    const opening = (id: string) =>
      this.nativeOpenings.get(uuid(id).toLowerCase()) ??
      this.cached(
        this.openingReads,
        `opening:${id}`,
        async (shared) =>
          parseOpening(await this.read(`/openings/${id}`, shared)),
        signal,
        false,
        [`/openings/${id}`],
      );
    const matches = (c: OpeningCard) =>
      c.subjectId === context.subjectId &&
      c.variant.veil === context.variant.veil &&
      c.variant.fullArt === context.variant.fullArt;
    if (context.surface !== "reveal" && context.entryIndex !== undefined) {
      let index = context.entryIndex;
      for (const id of ids) {
        const cards = await opening(id);
        if (index < cards.length) {
          const entry = [...cards].sort((a, b) => a.slot - b.slot)[index];
          if (entry && matches(entry))
            return copies.find((c) => c.id === entry.instanceId);
          break;
        }
        index -= cards.length;
      }
    }
    const batches = await Promise.all(ids.map(opening));
    const entries = batches.flat();
    if (!entries.length) return undefined;
    let ordered: OpeningCard[];
    if (context.surface === "reveal") {
      const ranks = [
        "Common",
        "Uncommon",
        "Rare",
        "Epic",
        "Legendary",
        "Mythic",
      ];
      ordered = [...entries].sort(
        (a, b) =>
          (a.variant.fullArt ? 2 : +a.variant.veil) -
            (b.variant.fullArt ? 2 : +b.variant.veil) ||
          ranks.indexOf(a.rarity) - ranks.indexOf(b.rarity) ||
          a.slot - b.slot,
      );
    } else
      ordered = batches.flatMap((cards) =>
        [...cards].sort((a, b) => a.slot - b.slot),
      );
    // Slot order is established from the delivered recap/reveal code, then independently checked against subject AND finish.
    const entry =
      context.entryIndex === undefined
        ? undefined
        : ordered[context.entryIndex];
    const candidates =
      entry && matches(entry) ? [entry] : entries.filter(matches);
    if (candidates.length !== 1) return undefined;
    return copies.find((c) => c.id === candidates[0].instanceId);
  }
  async remove(
    albumId: string,
    id: string,
    expectedAccount: string,
  ): Promise<void> {
    uuid(albumId);
    id = subjectId(id);
    const key = `${albumId}:${id}`;
    if (this.writes.has(key))
      throw new Error("An album update is already in progress.");
    this.writes.add(key);
    try {
      if ((await this.account()).key !== expectedAccount)
        throw new Error("Your Kosmora account changed. Reopen the tooltip.");
      const album = (await this.albums(id, undefined, true)).find(
        (a) => a.id === albumId,
      );
      if (!album) throw new Error("This album is no longer available.");
      if (album.contains === undefined)
        throw new Error("Album membership could not be verified.");
      if (!album.contains) return;
      try {
        await this.send(`/albums/${albumId}/items/${id}`, "DELETE");
      } catch (error) {
        // A failed response can follow a committed removal. Confirm it without
        // repeating the mutation or turning it into an add/remove toggle.
        const refreshed = await this.albums(id, undefined, true).catch(
          () => null,
        );
        if (refreshed?.find((a) => a.id === albumId)?.contains !== false)
          throw error;
      }
      this.albumReads.clear();
      if (
        (await this.albums(id, undefined, true)).find((a) => a.id === albumId)
          ?.contains !== false
      )
        throw new Error(
          "The removal could not be confirmed. Refresh membership before trying again.",
        );
    } finally {
      this.writes.delete(key);
    }
  }
  async add(
    albumId: string,
    copy: OwnedCopy,
    expectedAccount: string,
  ): Promise<void> {
    uuid(albumId);
    uuid(copy.id);
    subjectId(copy.subjectId);
    const key = `${albumId}:${copy.subjectId}`;
    if (this.writes.has(key))
      throw new Error("An album update is already in progress.");
    this.writes.add(key);
    try {
      if ((await this.account()).key !== expectedAccount)
        throw new Error("Your Kosmora account changed. Reopen the popup.");
      const current = await this.insights(copy.subjectId, undefined, true);
      if (!current.copies.some((c) => c.id === copy.id))
        throw new Error("You no longer own this copy.");
      const album = (await this.albums(copy.subjectId, undefined, true)).find(
        (a) => a.id === albumId,
      );
      if (!album) throw new Error("This album is no longer available.");
      if (album.contains) return;
      if (album.contains === undefined)
        throw new Error("Album membership could not be verified.");
      if (album.items >= 2000)
        throw new Error("This album is full (2,000 cards).");
      try {
        object(
          await this.send(`/albums/${albumId}/items`, "POST", {
            subjectIds: [copy.subjectId],
            copyId: copy.id,
          }),
        );
      } catch (error) {
        // A timeout can occur after the server committed. Reconcile, but never repeat the POST.
        const refreshed = await this.albums(
          copy.subjectId,
          undefined,
          true,
        ).catch(() => null);
        if (!refreshed?.find((a) => a.id === albumId)?.contains) throw error;
      }
      this.albumReads.clear();
      if (
        !(await this.albums(copy.subjectId, undefined, true)).find(
          (a) => a.id === albumId,
        )?.contains
      )
        throw new Error(
          "The update could not be confirmed. Refresh membership before trying again.",
        );
    } finally {
      this.writes.delete(key);
    }
  }
}
