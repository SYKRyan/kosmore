import { selectedSocialFriend, type SocialFriend } from "../kosmora/social";
import {
  friendReminderKey,
  parseFriendReminder,
  readFriendReminder,
  saveFriendReminder,
} from "../shared/friend-reminders";
import type { Account, KosmoraClient } from "../shared/types";
import { FriendReminders } from "./friend-reminders";

interface ActiveFriend {
  friend: SocialFriend;
  view: FriendReminders;
  abort: AbortController;
  account?: Account;
  storageKey?: string;
}
export class SocialReminders {
  private active?: ActiveFriend;
  private scheduled = false;
  constructor(private client: Pick<KosmoraClient, "account" | "families">) {}
  start() {
    const observer = new MutationObserver(() => this.schedule());
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "class", "hidden", "aria-hidden"],
    });
    window.addEventListener("popstate", () => this.schedule());
    window.addEventListener("focus", () => void this.checkAccount());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void this.checkAccount();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      const active = this.active;
      if (
        area !== "local" ||
        !active?.storageKey ||
        !changes[active.storageKey]
      )
        return;
      try {
        active.view.receive(
          parseFriendReminder(changes[active.storageKey].newValue),
        );
      } catch (error) {
        active.view.failed(error);
      }
    });
    this.scan();
  }
  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.scan();
    });
  }
  private async checkAccount() {
    const active = this.active;
    if (!active?.account) return;
    try {
      const account = await this.client.account();
      if (this.active === active && account.key !== active.account.key)
        this.scan(true);
    } catch (error) {
      if (this.active === active) {
        this.clear();
        // A fresh editor has no previous account's notes and cannot save until verified.
        this.scan();
      }
    }
  }
  private clear() {
    this.active?.abort.abort();
    this.active?.view.dispose();
    this.active = undefined;
  }
  private scan(force = false) {
    const friend = selectedSocialFriend();
    const previous = this.active;
    if (
      !force &&
      friend &&
      previous &&
      previous.friend.panel === friend.panel &&
      previous.friend.key === friend.key &&
      previous.friend.accountHint === friend.accountHint &&
      previous.view.host.isConnected
    )
      return;
    this.clear();
    if (!friend) return;
    const abort = new AbortController();
    const view = new FriendReminders(
      friend.handle,
      async (value) => {
        if (!active.account || !active.storageKey)
          throw new Error("Your account could not be verified.");
        if ((await this.client.account()).key !== active.account.key) {
          if (this.active === active) this.scan(true);
          throw new Error(
            "Your Kosmora account changed. Reopen the friend's reminders.",
          );
        }
        await saveFriendReminder(active.storageKey, value);
      },
      () => void this.loadFamilies(active, true),
    );
    const active: ActiveFriend = { friend, view, abort };
    this.active = active;
    friend.panel.after(view.host);
    void this.load(active);
  }
  private async load(active: ActiveFriend) {
    try {
      const account = await this.client.account(active.abort.signal);
      if (this.active !== active) return;
      if (
        active.friend.accountHint &&
        account.key !== active.friend.accountHint
      )
        throw new Error(
          "Your account is changing. Refresh Kosmora to load private reminders.",
        );
      active.account = account;
      active.storageKey = friendReminderKey(account.key, active.friend.key);
      void this.loadFamilies(active);
      const value = await readFriendReminder(active.storageKey);
      if (this.active === active) active.view.load(value);
    } catch (error) {
      if (this.active === active) active.view.failed(error);
    }
  }
  private async loadFamilies(active: ActiveFriend, fresh = false) {
    active.view.loadingFamilies();
    try {
      const families = await this.client.families(active.abort.signal, fresh);
      if (this.active === active) active.view.setFamilyChoices(families);
    } catch (error) {
      if (this.active === active) active.view.familiesFailed(error);
    }
  }
}
