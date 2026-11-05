import { ReadCache } from "../shared/cache";
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
  private cache = new ReadCache(100, 30_000);
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
    const signal = this.abort.signal;
    if (!this.account) {
      const task = this.client.account(signal);
      this.account = task;
      void task.catch(() => {
        if (this.account === task) this.account = undefined;
      });
    }
    const account = await this.account;
    return this.cache.get(
      `${account.key}:${id}:${settings.showOnSaleOverlay}:${settings.showActiveAuctionsOverlay}:${settings.showLowestListingPriceOverlay}:${settings.showSaleHistoryOverlay}:${settings.showLastSalePriceOverlay}:${settings.showFriendInterestOverlay}:${settings.showQuestOverlay}`,
      async () => {
        let onSale = false,
          activeAuctions = false,
          saleHistory = false,
          interestedFriends = 0,
          quest = false;
        let lastSale: Sale | undefined,
          lowestListingPrice: string | undefined,
          marketName: string | undefined,
          historyFailed = false;
        let details: Promise<CardInsights> | undefined;
        const insights = () =>
          (details ??= this.client.insights(
            id,
            signal,
            settings.showOnSaleOverlay,
          ));
        if (settings.showOnSaleOverlay) {
          try {
            const card = await insights();
            onSale = card.copies.some((copy) => !!copy.auctionId);
          } catch (error) {
            if (
              error instanceof ApiError &&
              (error.status === 429 || error.status === 401)
            )
              throw error;
          }
        }
        if (settings.showQuestOverlay) {
          const subjects = await (this.quests ??= this.client
            .questSubjects(signal)
            .then((ids) => new Set(ids))
            .catch((error) => {
              if (
                error instanceof ApiError &&
                (error.status === 429 || error.status === 401)
              )
                throw error;
              return undefined;
            }));
          quest = subjects?.has(id) ?? false;
        }
        if (settings.showSaleHistoryOverlay) {
          for (const finish of [
            displayedFinish,
            ...FINISHES.filter((f) => f !== displayedFinish),
          ]) {
            try {
              const history = await this.client.history(id, finish, signal);
              if (history.count > 0) {
                saleHistory = true;
                if (!settings.showLastSalePriceOverlay) break;
              }
              for (const sale of history.sales)
                if (
                  !lastSale ||
                  Date.parse(sale.soldAt) > Date.parse(lastSale.soldAt)
                )
                  lastSale = sale;
            } catch (error) {
              historyFailed = true;
              if (
                error instanceof ApiError &&
                (error.status === 429 || error.status === 401)
              )
                throw error;
            }
          }
          if (historyFailed || !settings.showLastSalePriceOverlay)
            lastSale = undefined;
        }
        if (settings.showActiveAuctionsOverlay) {
          try {
            const card = await insights();
            activeAuctions =
              (await this.client.activeAuctions(id, card.name, signal)) > 0;
            if (activeAuctions) marketName = card.name;
            if (activeAuctions && settings.showLowestListingPriceOverlay)
              lowestListingPrice = await this.client.lowestListingPrice(
                id,
                card.name,
                signal,
              );
          } catch (error) {
            if (
              error instanceof ApiError &&
              (error.status === 429 || error.status === 401)
            )
              throw error;
          }
        }
        if (settings.showFriendInterestOverlay) {
          const saved = await this.friendPreferences(account, signal);
          if (
            saved &&
            [...saved.reminders.values()].some((r) => r.families.length)
          ) {
            try {
              const card = await insights();
              if (card.families)
                interestedFriends = matchFriends(
                  card.families,
                  saved.friends,
                  saved.reminders,
                ).length;
            } catch (error) {
              if (
                error instanceof ApiError &&
                (error.status === 429 || error.status === 401)
              )
                throw error;
            }
          }
        }
        signal.throwIfAborted();
        return {
          onSale,
          activeAuctions,
          saleHistory,
          interestedFriends,
          quest,
          ...(lastSale ? { lastSale } : {}),
          ...(lowestListingPrice !== undefined ? { lowestListingPrice } : {}),
          ...(marketName ? { marketName } : {}),
        };
      },
    );
  }
}
