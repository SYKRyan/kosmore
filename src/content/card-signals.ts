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
>;
export class CardSignalProvider {
  private cache = new ReadCache(150, 30_000);
  private progress = new Map<
    string,
    { value: CardSignals; listeners: Set<(value: CardSignals) => void> }
  >();
  private abort = new AbortController();
  private account?: Promise<Account>;
  private quests?: Promise<Set<string> | undefined>;
  private preferences?: Promise<
    { friends: Friend[]; reminders: Map<string, FriendReminder> } | undefined
  >;
  constructor(
    private client: Pick<
      KosmoraClient,
      | "account"
      | "friends"
      | "history"
      | "insights"
      | "questSubjects"
      | "activeAuctions"
      | "lowestListingPrice"
    >,
  ) {}
  reset() {
    this.abort.abort();
    this.abort = new AbortController();
    this.account = undefined;
    this.quests = undefined;
    this.preferences = undefined;
    this.cache.clear();
    this.progress.clear();
  }
  private friendPreferences(account: Account, signal: AbortSignal) {
    return (this.preferences ??= (async () => {
      try {
        const friends = await this.client.friends(signal);
        const { reminders } = await readFriendPreferences(account.key, friends);
        return { friends, reminders };
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.status === 429 || error.status === 401)
        )
          throw error;
        return undefined;
      }
    })());
  }
  async get(
    id: string,
    settings: OverlaySettings,
    displayedFinish: Finish,
    onProgress?: (signals: CardSignals) => void,
    priority: RequestPriority = "background",
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
    const signal = setRequestPriority(
      AbortSignal.any([this.abort.signal]),
      priority,
    );
    if (!this.account) {
      const task = this.client.account(signal, false);
      this.account = task;
      void task.catch(() => {
        if (this.account === task) this.account = undefined;
      });
    }
    const account = await this.account;
    signal.throwIfAborted();
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
      state = { value: empty(), listeners: new Set() };
      this.progress.set(key, state);
    }
    const current = state;
    if (onProgress) current.listeners.add(onProgress);
    try {
      const result = await this.cache.get(
        key,
        async () => {
          let failed = false;
          const publish = (patch: Partial<CardSignals>) => {
            if (failed || signal.aborted) return;
            current.value = { ...current.value, ...patch };
            for (const listener of current.listeners) listener(current.value);
          };
          const guard = async (work: () => Promise<void>) => {
            try {
              await work();
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
          };
          let details: Promise<CardInsights> | undefined;
          const insights = () =>
            (details ??= this.client.insights(id, signal, false));
          const jobs: Promise<void>[] = [];
          if (settings.showOnSaleOverlay)
            jobs.push(
              guard(async () => {
                const card = await insights();
                publish({
                  onSale: card.copies.some((copy) => !!copy.auctionId),
                });
              }),
            );
          if (settings.showQuestOverlay)
            jobs.push(
              guard(async () => {
                const subjects = await (this.quests ??= this.client
                  .questSubjects(signal)
                  .then((ids) => new Set(ids)));
                publish({ quest: subjects?.has(id) ?? false });
              }),
            );
          if (settings.showSaleHistoryOverlay)
            jobs.push(
              guard(async () => {
                let lastSale: Sale | undefined;
                let historyFailed = false;
                const check = async (finish: Finish) => {
                  try {
                    const history = await this.client.history(
                      id,
                      finish,
                      signal,
                    );
                    if (history.count > 0) publish({ saleHistory: true });
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
                  await Promise.all(finishes.map(check));
                  if (!historyFailed && lastSale) publish({ lastSale });
                } else {
                  for (const finish of finishes) if (await check(finish)) break;
                }
              }),
            );
          if (settings.showActiveAuctionsOverlay)
            jobs.push(
              guard(async () => {
                const card = await insights();
                const activeAuctions =
                  (await this.client.activeAuctions(id, card.name, signal)) > 0;
                publish({
                  activeAuctions,
                  ...(activeAuctions ? { marketName: card.name } : {}),
                });
                if (activeAuctions && settings.showLowestListingPriceOverlay) {
                  const lowestListingPrice =
                    await this.client.lowestListingPrice(id, card.name, signal);
                  if (lowestListingPrice !== undefined)
                    publish({ lowestListingPrice });
                }
              }),
            );
          if (settings.showFriendInterestOverlay)
            jobs.push(
              guard(async () => {
                const saved = await this.friendPreferences(account, signal);
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
              }),
            );
          await Promise.all(jobs);
          signal.throwIfAborted();
          return current.value;
        },
        false,
        signal,
      );
      onProgress?.(result);
      return result;
    } finally {
      if (onProgress) current.listeners.delete(onProgress);
      if (
        !current.listeners.size &&
        !this.cache.hasPending(key) &&
        this.progress.get(key) === current
      )
        this.progress.delete(key);
    }
  }
}
