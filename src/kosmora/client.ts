import {
  FAMILIES_TTL,
  FRIENDS_TTL,
  type NativeReadCache,
} from "../shared/native-read-cache";
import { type CardView } from "../shared/services";
import { request } from "../shared/messages";
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
import {
  parseInterestPage,
  interestCounts,
  type InterestEntry,
} from "./trade-interest";
import {
  listingCopyId,
  auctionListingOutcome,
  initialListingLimits,
  parseListingBatch,
  type PersonalListing,
  type TrackedListing,
  type TrackedListingHistory,
} from "./my-listings";
import type { Result } from "../shared/messages";
import type {
  Account,
  Album,
  CardContext,
  CardInsights,
  KosmoraClient,
  OpeningCard,
  OwnedCopy,
  Finish,
  MarketHistory,
} from "../shared/types";
import {
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
  private familyCatalog = new ReadCache(1, FAMILIES_TTL);
  private pendingViews = new Map<string, Promise<Record<string, CardView>>>();
  private cardViews = new Map<string, CardView>();
  private observedAuctions = new Map<string, PersonalListing>();
  private observedOwners = new Map<string, string>();
  private observedCards = new Map<string, CardInsights>();
  private observedHistory = new Map<string, MarketHistory>();
  private observedInterest = new Map<string, InterestEntry[]>();
  private albumReads = new ReadCache(100, 10_000);
  private packReads = new ReadCache(1, 0);
  private nativeOpenings = new Map<string, OpeningCard[]>();
  private accountReads = new ReadCache(1, 2_000);
  private listingListenersChanged = new Set<() => void>();
  private familyCountReads = new ReadCache(40, 300_000);
  private scheduler = new RequestScheduler(3);
  private accountVersion = 0;
  private collectSaleRateData = true;
  onVerifiedAccount?: (account: Account) => void;
  private accountListeners = new Set<() => void>();
  private historyListeners = new Set<
    (subjectId: string, history: MarketHistory, loadedAt: number) => void
  >();
  private lastAccount?: Account;
  private accountObservedAt = 0;
  private identityHint?: string;
  private inventory?: { key: string; at: number; ids: string[] };

  get displayAccount() {
    return this.lastAccount;
  }

  observeIdentity(raw: unknown) {
    let next: Account | undefined;
    try {
      next = parseAccount(raw);
    } catch {
      /* Signed out or incomplete identity. */
    }
    if (
      !next ||
      (this.lastAccount && next.key !== this.lastAccount.key) ||
      (this.identityHint && next.key !== this.identityHint)
    ) {
      const hadAccount = !!this.lastAccount;
      this.accountReads.clear();
      this.lastAccount = undefined;
      this.clearPrivateReads();
      if (hadAccount) for (const listener of this.accountListeners) listener();
    }
    this.identityHint = next?.key;
    // Page messages can invalidate identity. Only an isolated-world check unlocks private data.
    if (next && next.key === this.lastAccount?.key) {
      this.lastAccount = next;
      this.accountObservedAt = Date.now();
    }
    return next?.key;
  }

  observeInventory(raw: unknown, href: string) {
    if (href !== location.href) return;
    const data = object(raw);
    if (
      data.next ||
      data.cursor ||
      data.hasMore ||
      !Array.isArray(data.packs) ||
      (typeof data.total === "number" && data.total !== data.packs.length)
    )
      return;
    this.inventory = { key: href, at: Date.now(), ids: parseReadyPackIds(raw) };
  }

  async verifiedCopy(subject: string, copyId: string, expectedAccount: string) {
    if ((await this.account(undefined, true)).key !== expectedAccount)
      throw new Error("Your Kosmora account changed. Reopen the tooltip.");
    const version = this.accountVersion;
    const card = parseInsights(
      await this.read("/collection/" + subjectId(subject)),
    );
    if (card.subjectId !== subject || version !== this.accountVersion)
      throw new Error("Could not verify this card for the current account.");
    const copy = card.copies.find((item) => item.id === copyId);
    if (!copy) throw new Error("You no longer own this copy.");
    return copy;
  }
  private blockedUntil = 0;
  private rateLimitRequestStartedAt = 0;
  private writes = new Set<string>();
  constructor(
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private nativeReads?: NativeReadCache,
  ) {}
  onAccountChange(listener: () => void) {
    this.accountListeners.add(listener);
  }
  setSaleRateCollection(enabled: boolean) {
    if (this.collectSaleRateData === enabled) return;
    this.collectSaleRateData = enabled;
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
  private clearPrivateReads() {
    this.accountVersion++;
    this.inventory = undefined;
    this.nativeOpenings.clear();
    this.clearServiceViews();
    this.observedCards.clear();
    this.observedOwners.clear();
    this.observedAuctions.clear();
    this.observedInterest.clear();
    for (const cache of [
      this.reads,
      this.albumReads,
      this.packReads,
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
    signal?.throwIfAborted();
    if (
      !fresh &&
      this.lastAccount &&
      Date.now() - this.accountObservedAt < 30_000
    )
      return this.lastAccount;
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
        const firstVerification = !this.lastAccount;
        const changed = !!this.lastAccount && next.key !== this.lastAccount.key;
        if (changed || (this.identityHint && this.identityHint !== next.key)) {
          this.clearPrivateReads();
        }
        this.identityHint = next.key;
        this.lastAccount = next;
        this.accountObservedAt = Date.now();
        if (changed) for (const listener of this.accountListeners) listener();
        if (firstVerification || changed) this.onVerifiedAccount?.(next);
        if (firstVerification) this.listingsChanged(next.key);
        return next;
      },
      fresh && !this.accountReads.hasPending("account"),
      signal,
    );
  }
  clearServiceViews(ids?: string[]) {
    if (!ids) {
      this.cardViews.clear();
      this.pendingViews.clear();
      return true;
    }
    let relevant = false;
    for (const id of ids) {
      const hadView = this.cardViews.delete(id);
      relevant = this.pendingViews.delete(id) || hadView || relevant;
    }
    return relevant;
  }
  observeCardIds(ids: string[]) {
    for (let i = 0; i < ids.length; i += 500)
      void request({ op: "servicesObserve", ids: ids.slice(i, i + 500) }).catch(
        () => {},
      );
  }
  async observeCardDetails(raw: unknown) {
    try {
      const card = parseInsights(raw);
      const owner = this.lastAccount?.key ?? this.identityHint;
      this.remember(this.observedCards, card.subjectId, card);
      if (owner) this.remember(this.observedOwners, card.subjectId, owner);
      else this.observedOwners.delete(card.subjectId);
    } catch {}
  }

  hasObservedCopies(id: string) {
    return (
      !!this.observedOwners.get(id) &&
      !!this.observedCards.get(id)?.copies.length
    );
  }
  observeMarketHistory(id: string, finish: Finish, raw: unknown) {
    try {
      const history = parseHistory(raw, finish);
      this.remember(this.observedHistory, `${id}:${finish}`, history);
      if (this.collectSaleRateData)
        for (const listener of this.historyListeners)
          listener(id, history, Date.now());
    } catch {}
  }
  observeCollection(path: string, raw: unknown) {
    if (!this.lastAccount) return;
    try {
      const params = new URL(path, "https://kosmora.io").searchParams;
      const family = params.get("family");
      if (
        !family ||
        params.get("status") !== "available" ||
        params.get("sendable") !== "1" ||
        params.has("cursor")
      )
        return;
      const page = parseInterestPage(raw);
      if (!page.cursor)
        this.remember(this.observedInterest, family, page.items);
    } catch {}
  }
  private remember<T>(values: Map<string, T>, key: string, value: T) {
    values.delete(key);
    values.set(key, value);
    if (values.size > 500) values.delete(values.keys().next().value!);
  }
  private async serviceView(
    id: string,
    signal?: AbortSignal,
    includeMyListings = false,
  ) {
    id = subjectId(id);
    signal?.throwIfAborted();
    const version = this.accountVersion;
    const pendingKey = includeMyListings ? id + ":mine" : id;
    let pending = this.pendingViews.get(pendingKey);
    if (!pending) {
      const account = this.lastAccount?.key;
      const read = request<Record<string, CardView>>({
        op: "servicesRead",
        ids: [id],
        account: includeMyListings ? account : undefined,
        includeMyListings,
      }).finally(() => {
        if (this.pendingViews.get(pendingKey) === read)
          this.pendingViews.delete(pendingKey);
      });
      this.pendingViews.set(pendingKey, (pending = read));
    }
    const result = await pending;
    signal?.throwIfAborted();
    if (version !== this.accountVersion)
      throw new DOMException("The Kosmora account changed.", "AbortError");
    const view = result[id];
    if (!view)
      throw new Error(
        "Connect KosMore Services in Settings to load card data.",
      );
    this.remember(this.cardViews, id, view);
    return view;
  }
  async refreshCachedCard(id: string, signal?: AbortSignal) {
    const version = this.accountVersion;
    const result = await request<Record<string, CardView>>({
      op: "servicesPeek",
      ids: [id],
      account: this.lastAccount?.key,
    });
    signal?.throwIfAborted();
    if (version !== this.accountVersion) return;
    const view = result[id];
    if (view) this.remember(this.cardViews, id, view);
    return view;
  }
  async insights(
    id: string,
    signal?: AbortSignal,
    _fresh = false,
    includeMyListings = false,
  ): Promise<CardInsights> {
    const view = await this.serviceView(id, signal, includeMyListings);
    const native = this.observedCards.get(id);
    const copiesKnown =
      !!native &&
      !!this.lastAccount &&
      this.observedOwners.get(id) === this.lastAccount.key;
    const card = view.card;
    if (!card)
      throw new Error(
        view.accessBlocked
          ? "Services access is blocked. Open Settings to retry after approval."
          : view.missing
            ? "This card is unavailable."
            : "Card data is temporarily unavailable.",
      );
    return {
      subjectId: id,
      name: card.name,
      rarity: card.rarity,
      families: card.families.map((family) =>
        native?.families?.some(
          (value) => value.id === family.id && value.economic === false,
        )
          ? { ...family, economic: false as const }
          : family,
      ),
      questMember: card.quests.length > 0,
      interested: native?.interested ?? null,
      readership: native?.readership ?? null,
      readershipSource: native?.readershipSource,
      copies: copiesKnown ? native.copies : [],
      copiesKnown,
      onSale:
        view.listings === undefined ? undefined : view.listings.length > 0,
    };
  }
  async activeAuctions(
    id: string,
    name: string,
    signal?: AbortSignal,
    _fresh = false,
    onMatch?: () => void,
  ) {
    return (await this.auctionSummary(id, name, signal, onMatch)).count;
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
    cacheOnly = false,
  ): Promise<TrackedListingHistory> {
    const account = cacheOnly
      ? this.lastAccount
      : await this.account(signal, false);
    if (!account)
      throw new Error("Your cached Kosmora account is unavailable.");
    const [saved, view] = await Promise.all([
      this.listingRequest<TrackedListingHistory>(
        "listingCache",
        account.key,
        subjectId(id),
        signal,
      ),
      (cacheOnly
        ? this.refreshCachedCard(id, signal)
        : this.serviceView(id, signal, true)
      ).catch(() => undefined),
    ]);
    signal?.throwIfAborted();
    const open = (view?.listings ?? []).map((row): TrackedListing => ({
      ...row,
      group: "selling",
      state: "open",
    }));
    const listings = saved.listings.filter(
      (local) =>
        !open.some(
          (row) =>
            row.startPrice === local.startPrice &&
            row.endsAt === local.endsAt &&
            row.finish === local.finish,
        ),
    );
    return {
      listings: [
        ...open.sort((a, b) => Date.parse(b.endsAt!) - Date.parse(a.endsAt!)),
        ...listings,
      ],
      hasMore: false,
      openListingsKnown: view?.listings !== undefined,
    };
  }
  async latestListing(
    id: string,
    signal?: AbortSignal,
  ): Promise<TrackedListing | undefined> {
    const account = this.displayAccount;
    if (!account) return;
    return this.listingRequest<TrackedListing | undefined>(
      "listingSavedPrice",
      account.key,
      subjectId(id),
      signal,
    );
  }
  async discountListingPrice(
    _subject: string,
    _copyId: string,
    threshold: number,
    listings: TrackedListing[],
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    let failed = 0;
    let price: string | undefined;
    for (const row of listings) {
      if (/cancel/i.test(row.state ?? "")) continue;
      if (row.group !== "unsold") break;
      price ??= row.startPrice;
      if (++failed >= threshold) return price;
    }
  }
  async observeOwnAuction(id: string, raw: unknown) {
    const row = object(object(raw).auction);
    if (row.id !== id || row.yours !== true || !this.displayAccount) return;
    const outcome = auctionListingOutcome(row);
    if (!outcome) return;
    await this.observeOwnListings({
      items: [{ ...row, group: outcome.group }],
      groups: { selling: 0, sold: 0, unsold: 0, [outcome.group]: 1 },
    });
  }
  async observeOwnListings(raw: unknown) {
    const account = this.displayAccount;
    if (!account) return;
    const batch = parseListingBatch(raw, account.key, initialListingLimits());
    for (const row of batch.listings)
      this.remember(this.observedAuctions, row.id.toLowerCase(), row);
    if (batch.listings.length)
      await this.listingRequest(
        "listingObserved",
        account.key,
        "0",
        undefined,
        { rows: batch.listings.slice(0, 500) },
      );
  }
  async captureListings(confirmations: unknown) {
    const previous = this.lastAccount;
    const account = await this.account();
    if (previous && previous.key !== account.key) return;
    const seen = new Set<string>();
    const records: RecordedListing[] = [];
    const receipts: { auctionId: string; submittedAt: number }[] = [];
    for (const raw of Array.isArray(confirmations)
      ? confirmations.slice(0, 500)
      : []) {
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
        const observed = this.observedAuctions.get(id);
        const record = {
          id,
          subjectId: observed?.subjectId ?? row.subjectId,
          startPrice: observed?.startPrice ?? row.startPrice,
          submittedAt: row.submittedAt,
          copyId: listingCopyId(row.copyId),
        };
        if (validRecordedListing(record)) records.push(record);
        else receipts.push({ auctionId: id, submittedAt: row.submittedAt });
      } catch {}
    }
    if (records.length || receipts.length)
      await this.listingRequest("listingRecord", account.key, "0", undefined, {
        records,
        ...(receipts.length && { receipts }),
      });
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
    // An unloaded extension can throw before sendMessage returns a promise.
    const send = async (message: Record<string, unknown>) =>
      chrome.runtime.sendMessage(message);
    return new Promise((resolve, reject) => {
      const cancel = () => {
        reject(
          signal?.reason ??
            new DOMException("Listing lookup canceled.", "AbortError"),
        );
      };
      signal?.addEventListener("abort", cancel, { once: true });
      void send({ requestId, op, accountKey, subjectId: id, ...extra })
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
    _fresh = false,
  ) {
    return (await this.auctionSummary(id, name, signal)).lowestPrice;
  }
  async hasActiveAuctions(
    id: string,
    name: string,
    signal?: AbortSignal,
    onMatch?: () => void,
  ) {
    return (await this.activeAuctions(id, name, signal, false, onMatch)) > 0;
  }
  private auctionStats(view: CardView) {
    const open =
      view.card?.auctions.filter(
        (auction) => Date.parse(auction.endsAt) > Date.now(),
      ) ?? [];
    let lowestPrice: string | undefined;
    for (const row of open)
      if (lowestPrice === undefined || BigInt(row.price) < BigInt(lowestPrice))
        lowestPrice = row.price;
    return { count: open.length, lowestPrice };
  }
  private async auctionSummary(
    id: string,
    _name: string,
    signal?: AbortSignal,
    onMatch?: () => void,
  ) {
    const view = await this.serviceView(id, signal);
    if (!view.card) throw new Error("Auction data is unavailable.");
    const value = this.auctionStats(view);
    if (value.count) onMatch?.();
    return value;
  }
  families(signal?: AbortSignal, _fresh = false) {
    const load = async () =>
      parseFamilyChoices(await this.read("/atlas/families"));
    return this.nativeReads
      ? this.nativeReads.get("families", FAMILIES_TTL, load, signal, false)
      : this.familyCatalog.get("families", load, false, signal);
  }
  expediteCard(id: string) {
    this.observeCardIds([subjectId(id)]);
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
    _fresh = false,
  ) {
    signal?.throwIfAborted();
    const entries: InterestEntry[] = [];
    for (const family of new Set(familyIds)) {
      const observed = this.observedInterest.get(family);
      if (!observed)
        throw new Error("Sendable collection data is unavailable.");
      entries.push(...observed);
    }
    return interestCounts(entries);
  }
  async friends(signal?: AbortSignal, _fresh = false) {
    if (this.nativeReads) {
      const account = await this.account(signal, false);
      return this.nativeReads.get(
        `friends.${account.key}`,
        FRIENDS_TTL,
        async () => parseFriends(await this.read("/friends")),
        signal,
        false,
      );
    }
    return this.cached(
      this.reads,
      "friends",
      async (shared) => parseFriends(await this.read("/friends", shared)),
      signal,
      false,
      ["/friends"],
    );
  }
  hasInteractiveReads() {
    return this.scheduler.hasInteractiveReads();
  }

  peekHistory(id: string, finish: Finish) {
    const view = this.cardViews.get(id);
    const value = view?.card?.markets[finish];
    if (value)
      return {
        value,
        stale: view.stale || view.until <= Date.now(),
        until: view.until,
      };
  }
  peekAuction(id: string, _name: string) {
    const view = this.cardViews.get(id);
    if (view?.card)
      return {
        fetchedAt: view.fetchedAt,
        value: this.auctionStats(view),
        stale: view.stale || view.until <= Date.now(),
        until: view.until,
      };
  }
  async hasSaleHistory(id: string, finish: Finish, signal?: AbortSignal) {
    const history = await this.history(id, finish, signal);
    return history.count > 0 || !!history.lastSale;
  }
  async history(
    id: string,
    finish: Finish,
    signal?: AbortSignal,
    _fresh = false,
  ) {
    const view = await this.serviceView(id, signal);
    const history = view.card?.markets[finish];
    if (!history) throw new Error("Market history is unavailable.");
    const observed = this.observedHistory.get(`${id}:${finish}`);
    return observed ? { ...history, sales: observed.sales } : history;
  }
  async receivePackData(value: unknown) {
    const data = object(value);
    if (data.kind !== "opening") return;
    const cards = parseOpening(data.data);
    if (!cards.length) return;
    this.nativeOpenings.set(cards[0].openingId.toLowerCase(), cards);
    if (this.nativeOpenings.size > 60)
      this.nativeOpenings.delete(this.nativeOpenings.keys().next().value!);
  }

  async readyPackIds(signal?: AbortSignal): Promise<string[]> {
    if (
      this.inventory &&
      this.inventory.key === location.href &&
      Date.now() - this.inventory.at < 30_000
    )
      return this.inventory.ids;
    const ids = await this.packReads.get(
      "ready-packs",
      async (shared) =>
        parseReadyPackIds(await this.read("/packs/inventory", shared)),
      false,
      signal,
    );
    return ids;
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
      this.nativeOpenings.get(uuid(id).toLowerCase()) ?? [];
    signal?.throwIfAborted();
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
      await this.verifiedCopy(copy.subjectId, copy.id, expectedAccount);
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
