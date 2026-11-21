import {
  friendReminderKey,
  parseFriendReminder,
  type FriendReminder,
} from "./friend-reminders";
import type { CardFamily, Friend } from "./types";
export interface TradeMatch {
  friend: Friend;
  families: CardFamily[];
}
export interface FriendDetails extends TradeMatch {
  reminder: FriendReminder;
}
export interface TradeMatches {
  matches: FriendDetails[];
  friendsWithPreferences: number;
  unreadable: number;
}
// Exact family labels, ignoring case and whitespace; no substring or domain inference.
const familyKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function matchFriends(
  families: CardFamily[],
  friends: Friend[],
  reminders: Map<string, FriendReminder>,
): TradeMatch[] {
  return friends
    .flatMap((friend) => {
      const saved = new Set(
        (reminders.get(friend.key)?.families ?? []).map(familyKey),
      );
      const matched = families.filter((family) =>
        saved.has(familyKey(family.name)),
      );
      return matched.length ? [{ friend, families: matched }] : [];
    })
    .sort(
      (a, b) =>
        b.families.length - a.families.length ||
        a.friend.handle.localeCompare(b.friend.handle, "en", {
          sensitivity: "base",
        }),
    );
}
export async function readTradeMatches(
  accountKey: string,
  families: CardFamily[],
  friends: Friend[],
): Promise<TradeMatches> {
  const { reminders, unreadable } = await readFriendPreferences(
    accountKey,
    friends,
  );
  return {
    matches: matchFriends(families, friends, reminders).map((match) => ({
      ...match,
      reminder: reminders.get(match.friend.key)!,
    })),
    friendsWithPreferences: [...reminders.values()].filter(
      (r) => r.families.length,
    ).length,
    unreadable,
  };
}
let interests: Promise<Set<string>> | undefined;
let listening = false;
export async function hasFriendInterests(account?: string): Promise<boolean> {
  if (!listening && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (
        area === "local" &&
        Object.keys(changes).some((key) => key.startsWith("kosmore.friend."))
      )
        interests = undefined;
    });
    listening = true;
  }
  if (!listening) interests = undefined;
  interests ??= chrome.storage.local
    .get(null)
    .then((values) => {
      const result = new Set<string>();
      for (const [key, value] of Object.entries(values)) {
        if (
          key.startsWith("kosmore.friend.") &&
          value &&
          typeof value === "object" &&
          "families" in value &&
          Array.isArray(value.families) &&
          value.families.length
        )
          result.add(key.split(".")[2]);
      }
      return result;
    })
    .catch((error) => {
      interests = undefined;
      throw error;
    });
  const keys = await interests;
  return account ? keys.has(account) : keys.size > 0;
}

export async function readFriendPreferences(
  accountKey: string,
  friends: Friend[],
): Promise<{ reminders: Map<string, FriendReminder>; unreadable: number }> {
  if (!friends.length) return { reminders: new Map(), unreadable: 0 };
  const keys = friends.map((friend) =>
    friendReminderKey(accountKey, friend.key),
  );
  const data = await chrome.storage.local.get(keys);
  const reminders = new Map<string, FriendReminder>();
  let unreadable = 0;
  friends.forEach((friend, index) => {
    try {
      reminders.set(friend.key, parseFriendReminder(data[keys[index]]));
    } catch {
      unreadable++;
    }
  });
  return { reminders, unreadable };
}
