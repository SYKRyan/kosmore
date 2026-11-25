import { latestSale } from "../shared/last-sale";
import { finishOf } from "../shared/sale-observations";
import { ReadCache } from "../shared/cache";
import {
  setRequestPriority,
  type RequestPriority,
} from "../shared/request-scheduler";
import {
  type Account,
  type AuctionPrice,
  type CardInsights,
  type Finish,
  type Friend,
  type KosmoraClient,
  type Settings,
  type MarketSale,
} from "../shared/types";
import {
  hasFriendInterests,
  matchFriends,
  readFriendPreferences,
} from "../shared/trade-matches";
import type { FriendReminder } from "../shared/friend-reminders";
import { ApiError } from "../kosmora/client";
export interface CardSignals {
  onSale: boolean;
  saleHighlight?: import("../shared/types").SaleHighlight;
  ownListing?: import("../shared/services").ServicesListing;
  activeAuctions: boolean;
  saleHistory: boolean;
  interestedFriends: number;
  quest: boolean;
  lastSale?: MarketSale;
  medianPrice?: string;
  lowestListing?: AuctionPrice;
  staleLastSale?: boolean;
  staleListingPrice?: boolean;
  auctionFetchedAt?: number;
  marketName?: string;
}
export function overlaySalePrice(signals: CardSignals, useMedian: boolean) {
  return useMedian ? signals.medianPrice : signals.lastSale?.price;
}
export function sameOverlaySignals(a: CardSignals, b: CardSignals) {
  return (
    a === b ||
    (a.onSale === b.onSale &&
      a.saleHighlight === b.saleHighlight &&
      a.ownListing === b.ownListing &&
      a.activeAuctions === b.activeAuctions &&
      a.saleHistory === b.saleHistory &&
      a.quest === b.quest &&
      a.interestedFriends === b.interestedFriends &&
      a.lastSale?.price === b.lastSale?.price &&
      a.medianPrice === b.medianPrice &&
      !!a.lastSale?.numberOne === !!b.lastSale?.numberOne &&
      a.lowestListing?.price === b.lowestListing?.price &&
      a.lowestListing?.bids === b.lowestListing?.bids &&
      a.lowestListing?.soleOwnListing === b.lowestListing?.soleOwnListing &&
      !!a.staleLastSale === !!b.staleLastSale &&
      !!a.staleListingPrice === !!b.staleListingPrice &&
      a.auctionFetchedAt === b.auctionFetchedAt &&
      a.marketName === b.marketName)
  );
}
export type OverlaySettings = Partial<Pick<Settings, "showAuctionBidCounts">> & Pick<
  Settings,
  | "cardOverlaysEnabled"
  | "showOnSaleOverlay"
  | "showActiveAuctionsOverlay"
  | "showLowestListingPriceOverlay"
  | "showSaleHistoryOverlay"
  | "showLastSalePriceOverlay"
  | "showFriendInterestOverlay"
  | "showQuestOverlay"
>;
export class CardSignalProvider {
  private cache = new ReadCache(150, 60_000);
  private progress = new Map<
    string,
    {
      value: CardSignals;
      listeners: Set<(value: CardSignals) => void>;
      badgesReady: boolean;
      readyListeners: Set<() => void>;
    }
  >();
  private abort = new AbortController();
  private context = new ReadCache(3);
  constructor(
    private client: Pick<
      KosmoraClient,
      | "saleStatus"
      | "account"
      | "friends"
      | "history"
      | "hasSaleHistory"
      | "hasActiveAuctions"
      | "insights"
      | "activeAuctions"
      | "lowestListing"
      | "peekAuction"
      | "peekHistory"
    >,
  ) {}
  reset() {
    this.abort.abort();
    this.abort = new AbortController();
    this.cache.clear();
    this.context.clear();
    this.progress.clear();
  }
  invalidateCards(ids: ReadonlySet<string>) {
    const matches = (key: string) => ids.has(key.slice(0, key.indexOf(":")));
    this.cache.deleteMatching(matches);
    for (const key of this.progress.keys())
      if (matches(key)) this.progress.delete(key);
  }
  private friendPreferences(
    account: Account,
    signal: AbortSignal,
    priority: RequestPriority,
  ) {
    return this.context.get(
      "friends",
      async (
        shared,
      ): Promise<
        | { friends: Friend[]; reminders: Map<string, FriendReminder> }
        | undefined
      > => {
        try {
          const friends = await this.client.friends(
            setRequestPriority(shared, priority),
          );
          const { reminders } = await readFriendPreferences(
            account.key,
            friends,
          );
          return { friends, reminders };
        } catch (error) {
          if (
            error instanceof ApiError &&
            (error.status === 429 || error.status === 401)
          )
            throw error;
          return undefined;
        }
      },
      false,
      signal,
    );
  }
  async get(
    id: string,
    settings: OverlaySettings,
    displayedFinish: Finish,
    onProgress?: (signals: CardSignals) => void,
    priority: RequestPriority = "background",
    consumer?: AbortSignal,
    onBadgesReady?: () => void,
  ): Promise<CardSignals> {
    if (
      !settings.cardOverlaysEnabled ||
      (!settings.showSaleHistoryOverlay &&
        !settings.showOnSaleOverlay &&
        !settings.showActiveAuctionsOverlay &&
        !settings.showFriendInterestOverlay &&
        !settings.showQuestOverlay)
    )
      return {
        onSale: false,
        activeAuctions: false,
        saleHistory: false,
        interestedFriends: 0,
        quest: false,
      };
    const demand = setRequestPriority(
      AbortSignal.any(
        consumer ? [this.abort.signal, consumer] : [this.abort.signal],
      ),
      priority,
    );
    const privateAccount = () =>
      this.context.get(
        "account",
        (shared) =>
          this.client.account(setRequestPriority(shared, priority), false),
        false,
        demand,
      );
    demand.throwIfAborted();
    const key = [
      id,
      displayedFinish,
      settings.showOnSaleOverlay,
      settings.showActiveAuctionsOverlay,
      settings.showLowestListingPriceOverlay,
      settings.showAuctionBidCounts,
      settings.showSaleHistoryOverlay,
      settings.showLastSalePriceOverlay,
      settings.showFriendInterestOverlay,
      settings.showQuestOverlay,
      !!onBadgesReady,
    ].join(":");
    const empty = (): CardSignals => ({
      onSale: false,
      activeAuctions: false,
      saleHistory: false,
      interestedFriends: 0,
      quest: false,
    });
    let state = this.progress.get(key);
    if (!state) {
      state = {
        value: empty(),
        listeners: new Set(),
        badgesReady: false,
        readyListeners: new Set(),
      };
      this.progress.set(key, state);
    }
    const current = state;
    const recap = !!onBadgesReady;
    const notifyReady = () => {
      if (current.readyListeners.delete(notifyReady) && !demand.aborted)
        onBadgesReady?.();
    };
    if (recap) current.readyListeners.add(notifyReady);
    if (onProgress) {
      current.listeners.add(onProgress);
      if (
        current.value.onSale ||
        current.value.activeAuctions ||
        current.value.saleHistory ||
        current.value.quest ||
        current.value.interestedFriends
      )
        onProgress(current.value);
    }
    if (current.badgesReady) notifyReady();
    try {
      const result = await this.cache.get(
        key,
        async (shared) => {
          const workAbort = new AbortController();
          const signal = setRequestPriority(
            AbortSignal.any([shared, workAbort.signal]),
            priority,
          );
          let failed = false;
          const publish = (patch: Partial<CardSignals>) => {
            if (failed || signal.aborted) return;
            if (
              (Object.keys(patch) as (keyof CardSignals)[]).every(
                (key) => current.value[key] === patch[key],
              )
            )
              return;
            current.value = { ...current.value, ...patch };
            for (const listener of current.listeners) listener(current.value);
          };
          const jobs: Promise<void>[] = [];
          let pendingBadges = 0;
          const add = (work: (ready: () => void) => Promise<void>) => {
            pendingBadges++;
            let waiting = true;
            const ready = () => {
              if (!waiting || failed || signal.aborted) return;
              waiting = false;
              if (--pendingBadges === 0) {
                current.badgesReady = true;
                for (const listener of current.readyListeners) listener();
              }
            };
            // Register all badge jobs before any can signal readiness.
            jobs.push(
              Promise.resolve().then(async () => {
                try {
                  await work(ready);
                } catch (error) {
                  if (
                    signal.aborted ||
                    (error instanceof ApiError &&
                      (error.status === 429 || error.status === 401))
                  ) {
                    failed = true;
                    throw error;
                  }
                }
                ready();
              }),
            );
          };
          let details: Promise<CardInsights> | undefined;
          const insights = () =>
            (details ??= this.client.insights(id, signal, false));
          if (settings.showOnSaleOverlay)
            add(async () => {
              await privateAccount();
              const card = await this.client.insights(id, signal, false, true);
              publish({
                onSale:
                  this.client.saleStatus?.(id, displayedFinish) ?? card.copies.some((copy) => !!copy.auctionId && copy.finishKnown !== false && finishOf(copy.variant) === displayedFinish),
              });
            });
          if (settings.showQuestOverlay)
            add(async () => {
              const card = await insights();
              publish({ quest: card.questMember ?? false });
            });
          if (settings.showSaleHistoryOverlay)
            add(async () => {
              if (
                !settings.showLastSalePriceOverlay &&
                this.client.hasSaleHistory
              ) {
                publish({
                  saleHistory: await this.client.hasSaleHistory(
                    id,
                    displayedFinish,
                    signal,
                  ),
                });
                return;
              }
              if (settings.showLastSalePriceOverlay) {
                const hit = this.client.peekHistory?.(id, displayedFinish);
                const now = Date.now();
                if (hit && now - hit.until < 86_400_000) {
                  const cached = latestSale(hit.value);
                  const recent = cached && Date.parse(cached.soldAt) >= now - 30 * 86_400_000;
                  if (recent || (!cached && hit.value.median != null))
                    publish({
                      saleHistory: true,
                      lastSale: cached,
                      medianPrice: hit.value.median ?? undefined,
                      staleLastSale: hit.stale,
                    });
                }
              }
              const history = await this.client.history(
                id,
                displayedFinish,
                signal,
              );
              publish({
                saleHistory: history.count > 0 || !!history.lastSale,
                ...(settings.showLastSalePriceOverlay && {
                  lastSale: latestSale(history),
                  medianPrice: history.median ?? undefined,
                  staleLastSale: this.client.peekHistory?.(id, displayedFinish)
                    ?.stale,
                }),
              });
            });
          if (settings.showActiveAuctionsOverlay)
            add(async (ready) => {
              const card = await insights();
              const matched = () => {
                publish({ activeAuctions: true, marketName: card.name });
                if (recap) ready();
              };
              const needListing = settings.showLowestListingPriceOverlay || settings.showAuctionBidCounts;
              if (
                !needListing &&
                this.client.hasActiveAuctions
              ) {
                if (
                  await this.client.hasActiveAuctions(
                    id,
                    displayedFinish,
                    signal,
                    matched,
                  )
                )
                  matched();
                return;
              }
              const cached = needListing
                ? this.client.peekAuction?.(id, displayedFinish)
                : undefined;
              const now = Date.now();
              if (
                needListing &&
                cached &&
                cached.value.lowestListing !== undefined &&
                now - cached.until < 86_400_000
              )
                publish({
                  activeAuctions: true,
                  marketName: card.name,
                  lowestListing: cached.value.lowestListing,
                  staleListingPrice: cached.stale,
                  auctionFetchedAt: cached.fetchedAt,
                });
              const count = recap
                ? await this.client.activeAuctions(
                    id,
                    displayedFinish,
                    signal,
                    false,
                    matched,
                  )
                : await this.client.activeAuctions(id, displayedFinish, signal);
              const activeAuctions = count > 0;
              publish({
                activeAuctions,
                ...(activeAuctions
                  ? { marketName: card.name }
                  : current.value.lowestListing !== undefined
                    ? {
                        lowestListing: undefined,
                        staleListingPrice:
                          this.client.peekAuction?.(id, displayedFinish)
                            ?.stale || undefined,
                      }
                    : {}),
              });
              ready();
              if (activeAuctions && needListing) {
                const lowestListing = await this.client.lowestListing(
                  id,
                  displayedFinish,
                  signal,
                );
                if (lowestListing !== undefined)
                  publish({
                    lowestListing,
                    staleListingPrice:
                      this.client.peekAuction?.(id, displayedFinish)?.stale ||
                      undefined,
                    auctionFetchedAt: this.client.peekAuction?.(
                      id,
                      displayedFinish,
                    )?.fetchedAt,
                  });
              }
            });
          if (settings.showFriendInterestOverlay)
            add(async () => {
              if (!(await hasFriendInterests())) return;
              const account = await privateAccount();
              if (!(await hasFriendInterests(account.key))) return;
              const saved = await this.friendPreferences(
                account,
                signal,
                priority,
              );
              if (
                saved &&
                [...saved.reminders.values()].some((r) => r.families.length)
              ) {
                const card = await insights();
                if (card.families)
                  publish({
                    interestedFriends: matchFriends(
                      card.families,
                      saved.friends,
                      saved.reminders,
                    ).length,
                  });
              }
            });
          try {
            await Promise.all(jobs);
          } catch (error) {
            workAbort.abort();
            throw error;
          }
          signal.throwIfAborted();
          if (current.value.activeAuctions && (settings.showLowestListingPriceOverlay || settings.showAuctionBidCounts)) {
            // The private view may have arrived after the public price in this batch.
            const latest = this.client.peekAuction?.(id, displayedFinish);
            if (latest?.value.lowestListing) publish({ lowestListing: latest.value.lowestListing });
          }
          return current.value;
        },
        false,
        demand,
      );
      onProgress?.(result);
      notifyReady();
      return result;
    } finally {
      current.readyListeners.delete(notifyReady);
      if (onProgress) current.listeners.delete(onProgress);
      if (
        !current.listeners.size &&
        !current.readyListeners.size &&
        !this.cache.hasPending(key) &&
        this.progress.get(key) === current
      )
        this.progress.delete(key);
    }
  }
}
