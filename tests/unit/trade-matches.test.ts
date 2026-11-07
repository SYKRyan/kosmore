import { afterEach, expect, it, vi } from "vitest";
import { parseCardFamilies, parseFriends } from "../../src/kosmora/friends";
import { parseInsights } from "../../src/kosmora/contracts";
import { matchFriends, readTradeMatches } from "../../src/shared/trade-matches";
import { card } from "../fixtures/data";
import type { FriendReminder } from "../../src/shared/friend-reminders";
const friends = parseFriends({
  friends: [{ handle: "batu" }, { handle: "FriendB" }, { handle: "NoMatch" }],
});
const families = parseCardFamilies(card().families);
const reminder = (...families: string[]): FriendReminder => ({
  schemaVersion: 1,
  notes: "Private note",
  families,
});
afterEach(() => vi.unstubAllGlobals());
it("matches exact family labels, handles multiple families, and sorts stronger matches first", () => {
  const matches = matchFriends(
    families,
    friends,
    new Map([
      ["batu", reminder("  astronomy  ")],
      ["friendb", reminder("Astronomy", "SPACE EXPLORATION")],
      ["nomatch", reminder("Astro")],
      ["formerfriend", reminder("Astronomy")],
    ]),
  );
  expect(matches.map((m) => m.friend.handle)).toEqual(["FriendB", "batu"]);
  expect(matches[0].families.map((f) => f.name)).toEqual([
    "Astronomy",
    "Space Exploration",
  ]);
  expect(matches[1].families.map((f) => f.name)).toEqual(["Astronomy"]);
});
it("reads only current-account and current-friend keys, isolating malformed records", async () => {
  const get = vi.fn(async () => ({
    "kosmore.friend.me.batu": reminder("Astronomy"),
    "kosmore.friend.me.friendb": { schemaVersion: 7 },
    "kosmore.friend.other.nomatch": reminder("Astronomy"),
    "kosmore.friend.me.formerfriend": reminder("Astronomy"),
  }));
  vi.stubGlobal("chrome", { storage: { local: { get } } });
  const result = await readTradeMatches("me", families, friends);
  expect(result.matches.map((m) => m.friend.handle)).toEqual(["batu"]);
  expect(result.matches[0].reminder).toEqual(reminder("Astronomy"));
  expect(result.unreadable).toBe(1);
  expect(result.friendsWithPreferences).toBe(1);
  expect(get).toHaveBeenCalledWith([
    "kosmore.friend.me.batu",
    "kosmore.friend.me.friendb",
    "kosmore.friend.me.nomatch",
  ]);
});
it("keeps missing or malformed card families separate from a known empty family list", () => {
  expect(parseInsights({ ...card(), families: undefined }).families).toBeNull();
  expect(
    parseInsights({ ...card(), families: [{ id: 42, name: "bad" }] }).families,
  ).toBeNull();
  expect(parseInsights({ ...card(), families: [] }).families).toEqual([]);
  expect(parseInsights(card()).families).toEqual(families);
});
it("validates the current friend list rather than trusting request handles or foreign markup", () => {
  expect(
    parseFriends({ friends: [{ handle: "Batu" }, { handle: "batu" }] }),
  ).toHaveLength(1);
  expect(() => parseFriends({ incoming: [{ handle: "batu" }] })).toThrow();
  expect(() => parseFriends({ friends: [{ handle: "../bad" }] })).toThrow();
  expect(
    matchFriends([], friends, new Map([["batu", reminder("Astronomy")]])),
  ).toEqual([]);
});
it("propagates local-storage failures and avoids reads when there are no current friends", async () => {
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => {
          throw new Error("Storage unavailable");
        }),
      },
    },
  });
  await expect(readTradeMatches("me", families, friends)).rejects.toThrow(
    "Storage unavailable",
  );
  expect(await readTradeMatches("me", families, [])).toEqual({
    matches: [],
    friendsWithPreferences: 0,
    unreadable: 0,
  });
});
