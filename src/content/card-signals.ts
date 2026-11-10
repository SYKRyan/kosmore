import { ReadCache } from "../shared/cache";
import {
  setRequestPriority,
  type RequestPriority,
} from "../shared/request-scheduler";
import {
  FINISHES,
  type Account,
  type CardInsights,
  type Finish,
  type Friend,
  type KosmoraClient,
  type Settings,
  type Sale,
} from "../shared/types";
import { matchFriends, readFriendPreferences } from "../shared/trade-matches";
import type { FriendReminder } from "../shared/friend-reminders";
import { ApiError } from "../kosmora/client";
export interface CardSignals {
  onSale: boolean;
  activeAuctions: boolean;
  saleHistory: boolean;
  interestedFriends: number;
  quest: boolean;
  lastSale?: Sale;
  lowestListingPrice?: string;
  staleLastSale?: boolean;
  staleListingPrice?: boolean;
  marketName?: string;
}
export type OverlaySettings = Pick<
  Settings,
  | "cardOverlaysEnabled"
  | "showOnSaleOverlay"
  | "showActiveAuctionsOverlay"
  | "showLowestListingPriceOverlay"
  | "showSaleHistoryOverlay"
  | "showLastSalePriceOverlay"
  | "showFriendInterestOverlay"
  | "showQuestOverlay"
> &
  Partial<Pick<Settings, "collectSaleRateData">>;
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
      | "account"
      | "friends"
      | "history"
      | "hasSaleHistory"
      | "hasActiveAuctions"
      | "insights"
      | "questSubjects"
      | "activeAuctions"
      | "lowestListingPrice"
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
    const account = await this.context.get(
      "account",
      (shared) =>
        this.client.account(setRequestPriority(shared, priority), false),
      false,
      demand,
    );
    demand.throwIfAborted();
    const key = [
      account.key,
      id,
      settings.showOnSaleOverlay,
      settings.showActiveAuctionsOverlay,
      settings.showLowestListingPriceOverlay,
      settings.showSaleHistoryOverlay,
      settings.showLastSalePriceOverlay,
      settings.showFriendInterestOverlay,
      settings.showQuestOverlay,
      settings.collectSaleRateData,
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
          const priceSignal = recap
            ? setRequestPriority(AbortSignal.any([signal]), "background")
            : signal;
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
              const card = await insights();
              publish({
                onSale: card.copies.some((copy) => !!copy.auctionId),
              });
            });
          if (settings.showQuestOverlay)
            add(async () => {
              const subjects = await this.context.get(
                "quests",
                (shared) =>
                  this.client
                    .questSubjects(setRequestPriority(shared, priority))
                    .then((ids) => new Set(ids)),
                false,
                signal,
              );
              publish({ quest: subjects.has(id) });
            });
          if (settings.showSaleHistoryOverlay)
            add(async (ready) => {
              let lastSale: Sale | undefined;
              let historyFailed = false;
              let hasSales = false;
              if (settings.showLastSalePriceOverlay) {
                const hits = FINISHES.map((finish) =>
                  this.client.peekHistory?.(id, finish),
                );
                const now = Date.now();
                if (hits.every((hit) => hit && now - hit.until < 86_400_000)) {
                  const cached = hits
                    .flatMap((hit) => hit!.value.sales)
                    .filter(
                      (sale) =>
                        Date.parse(sale.soldAt) >= now - 30 * 86_400_000,
                    )
                    .reduce<Sale | undefined>(
                      (latest, sale) =>
                        !latest ||
                        Date.parse(sale.soldAt) > Date.parse(latest.soldAt)
                          ? sale
                          : latest,
                      undefined,
                    );
                  if (cached)
                    publish({
                      saleHistory: true,
                      lastSale: cached,
                      staleLastSale: hits.some((hit) => hit!.stale),
                    });
                }
              }
              const check = async (finish: Finish, readSignal = signal) => {
                try {
                  if (
                    !settings.showLastSalePriceOverlay &&
                    this.client.hasSaleHistory
                  ) {
                    const present = await this.client.hasSaleHistory(
                      id,
                      finish,
                      signal,
                    );
                    if (present) publish({ saleHistory: true });
                    return present;
                  }
                  const history = await this.client.history(
                    id,
                    finish,
                    readSignal,
                  );
                  if (history.count > 0) {
                    hasSales = true;
                    publish({ saleHistory: true });
                  }
                  if (settings.showLastSalePriceOverlay)
                    for (const sale of history.sales)
                      if (
                        !lastSale ||
                        Date.parse(sale.soldAt) > Date.parse(lastSale.soldAt)
                      )
                        lastSale = sale;
                  return history.count > 0;
                } catch (error) {
                  historyFailed = true;
                  if (
                    error instanceof ApiError &&
                    (error.status === 429 || error.status === 401)
                  )
                    throw error;
                  return false;
                }
              };
              const finishes = [
                displayedFinish,
                ...FINISHES.filter((f) => f !== displayedFinish),
              ];
              if (settings.showLastSalePriceOverlay) {
                if (recap) {
                  for (const [index, finish] of finishes.entries()) {
                    if (!(await check(finish))) continue;
                    ready();
                    await Promise.all(
                      finishes
                        .slice(index + 1)
                        .map((rest) => check(rest, priceSignal)),
                    );
                    break;
                  }
                } else
                  await Promise.all(finishes.map((finish) => check(finish)));
                if (!historyFailed && (lastSale || current.value.lastSale))
                  publish({
                    saleHistory: hasSales,
                    lastSale,
                    staleLastSale: undefined,
                  });
              } else {
                for (const finish of finishes) if (await check(finish)) break;
              }
            });
          if (settings.showActiveAuctionsOverlay)
            add(async (ready) => {
              const card = await insights();
              const matched = () => {
                publish({ activeAuctions: true, marketName: card.name });
                if (recap) ready();
              };
              if (
                !settings.showLowestListingPriceOverlay &&
                this.client.hasActiveAuctions
              ) {
                if (
                  await this.client.hasActiveAuctions(
                    id,
                    card.name,
                    signal,
                    matched,
                  )
                )
                  matched();
                return;
              }
              const cached = settings.showLowestListingPriceOverlay
                ? this.client.peekAuction?.(id, card.name)
                : undefined;
              const now = Date.now();
              if (
                settings.showLowestListingPriceOverlay &&
                cached &&
                cached.value.lowestPrice !== undefined &&
                now - cached.until < 86_400_000
              )
                publish({
                  activeAuctions: true,
                  marketName: card.name,
                  lowestListingPrice: cached.value.lowestPrice,
                  staleListingPrice: cached.stale,
                });
              const count = recap
                ? await this.client.activeAuctions(
                    id,
                    card.name,
                    signal,
                    false,
                    matched,
                  )
                : await this.client.activeAuctions(id, card.name, signal);
              const activeAuctions = count > 0;
              publish({
                activeAuctions,
                ...(activeAuctions
                  ? { marketName: card.name }
                  : current.value.lowestListingPrice !== undefined
                    ? {
                        lowestListingPrice: undefined,
                        staleListingPrice: undefined,
                      }
                    : {}),
              });
              ready();
              if (activeAuctions && settings.showLowestListingPriceOverlay) {
                const lowestListingPrice = await this.client.lowestListingPrice(
                  id,
                  card.name,
                  signal,
                );
                if (lowestListingPrice !== undefined)
                  publish({
                    lowestListingPrice,
                    staleListingPrice: undefined,
                  });
              }
            });
          if (settings.showFriendInterestOverlay)
            add(async () => {
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
