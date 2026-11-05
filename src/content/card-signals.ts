import { ReadCache } from "../shared/cache";
import {
  FINISHES,
  type Account,
  type Finish,
  type Friend,
  type KosmoraClient,
  type Settings,
} from "../shared/types";
import { matchFriends, readFriendPreferences } from "../shared/trade-matches";
import type { FriendReminder } from "../shared/friend-reminders";
import { ApiError } from "../kosmora/client";
export interface CardSignals {
  saleHistory: boolean;
  interestedFriends: number;
  quest: boolean;
}
type OverlaySettings = Pick<
  Settings,
  "showSaleHistoryOverlay" | "showFriendInterestOverlay" | "showQuestOverlay"
>;
export class CardSignalProvider {
  private cache = new ReadCache(100);
  private abort = new AbortController();
  private account?: Promise<Account>;
  private quests?: Promise<Set<string> | undefined>;
  private preferences?: Promise<
    { friends: Friend[]; reminders: Map<string, FriendReminder> } | undefined
  >;
  constructor(
    private client: Pick<
      KosmoraClient,
      "account" | "friends" | "history" | "insights" | "questSubjects"
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
      !settings.showSaleHistoryOverlay &&
      !settings.showFriendInterestOverlay &&
      !settings.showQuestOverlay
    )
      return { saleHistory: false, interestedFriends: 0, quest: false };
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
      `${account.key}:${id}:${settings.showSaleHistoryOverlay}:${settings.showFriendInterestOverlay}:${settings.showQuestOverlay}`,
      async () => {
        let saleHistory = false,
          interestedFriends = 0,
          quest = false;
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
              if ((await this.client.history(id, finish, signal)).count > 0) {
                saleHistory = true;
                break;
              }
            } catch (error) {
              if (
                error instanceof ApiError &&
                (error.status === 429 || error.status === 401)
              )
                throw error;
            }
          }
        }
        if (settings.showFriendInterestOverlay) {
          const saved = await this.friendPreferences(account, signal);
          if (
            saved &&
            [...saved.reminders.values()].some((r) => r.families.length)
          ) {
            try {
              const card = await this.client.insights(id, signal);
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
        return { saleHistory, interestedFriends, quest };
      },
    );
  }
}
