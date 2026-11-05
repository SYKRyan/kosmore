import { afterEach, expect, it, vi } from "vitest";
import { CardSignalProvider } from "../../src/content/card-signals";
import { defaults } from "../../src/shared/settings";
import { parseHistory, parseInsights } from "../../src/kosmora/contracts";
import { ApiError } from "../../src/kosmora/client";
import { card, prices } from "../fixtures/data";
import type { Finish } from "../../src/shared/types";
afterEach(() => vi.unstubAllGlobals());
function harness() {
  const data: Record<string, unknown> = {
    "kosmore.friend.fixtureplayer.batu": {
      schemaVersion: 1,
      notes: "private",
      families: ["Astronomy"],
    },
  };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) =>
          Object.fromEntries(keys.map((k) => [k, data[k]])),
        ),
      },
    },
  });
  const client = {
    account: vi.fn(async () => ({
      key: "fixtureplayer",
      handle: "FixturePlayer",
    })),
    questSubjects: vi.fn(async () => ["42"]),
    friends: vi.fn(async () => [{ key: "batu", handle: "batu" }]),
    history: vi.fn(async (_id: string, finish: Finish) =>
      parseHistory(prices(3), finish),
    ),
    insights: vi.fn(async () => parseInsights(card())),
  };
  return { client, data, provider: new CardSignalProvider(client) };
}
it("deduplicates card checks and stops sale-history reads after the first confirmed positive", async () => {
  const h = harness();
  const result = await Promise.all([
    h.provider.get("42", defaults(), "plain"),
    h.provider.get("42", defaults(), "veil"),
  ]);
  expect(result).toEqual([
    { saleHistory: true, interestedFriends: 1, quest: true },
    { saleHistory: true, interestedFriends: 1, quest: true },
  ]);
  expect(h.client.account).toHaveBeenCalledTimes(1);
  expect(h.client.history).toHaveBeenCalledTimes(1);
  expect(h.client.insights).toHaveBeenCalledTimes(1);
});
it("does no game reads when all overlays are disabled", async () => {
  const h = harness();
  expect(
    await h.provider.get(
      "42",
      {
        showSaleHistoryOverlay: false,
        showFriendInterestOverlay: false,
        showQuestOverlay: false,
      },
      "plain",
    ),
  ).toEqual({ saleHistory: false, interestedFriends: 0, quest: false });
  expect(h.client.account).not.toHaveBeenCalled();
});
it("honors each toggle and skips card details when friends have no family preferences", async () => {
  const h = harness();
  delete h.data["kosmore.friend.fixtureplayer.batu"];
  expect(
    await h.provider.get(
      "42",
      {
        showSaleHistoryOverlay: false,
        showFriendInterestOverlay: true,
        showQuestOverlay: false,
      },
      "plain",
    ),
  ).toEqual({ saleHistory: false, interestedFriends: 0, quest: false });
  expect(h.client.history).not.toHaveBeenCalled();
  expect(h.client.insights).not.toHaveBeenCalled();
  h.provider.reset();
  h.client.history.mockImplementation(async (_id, finish) =>
    parseHistory(prices(0), finish),
  );
  expect(
    await h.provider.get(
      "42",
      {
        showSaleHistoryOverlay: true,
        showFriendInterestOverlay: false,
        showQuestOverlay: false,
      },
      "veil",
    ),
  ).toEqual({ saleHistory: false, interestedFriends: 0, quest: false });
  expect(h.client.history.mock.calls.map((c) => c[1])).toEqual([
    "veil",
    "plain",
    "fullart",
  ]);
  expect(h.client.friends).toHaveBeenCalledTimes(1);
});
it("does not invent sale signals on failures, and keeps a failed friend lookup separate", async () => {
  const h = harness();
  h.client.history.mockRejectedValue(new ApiError("Unavailable", 503));
  expect(await h.provider.get("42", defaults(), "plain")).toEqual({
    saleHistory: false,
    interestedFriends: 1,
    quest: true,
  });
  h.provider.reset();
  h.client.history.mockImplementation(async (_id, finish) =>
    parseHistory(prices(3), finish),
  );
  h.client.friends.mockRejectedValue(new ApiError("Unavailable", 503));
  expect(await h.provider.get("42", defaults(), "plain")).toEqual({
    saleHistory: true,
    interestedFriends: 0,
    quest: true,
  });
});
it("propagates server cooldowns instead of probing the remaining finishes", async () => {
  const h = harness();
  const retryAt = Date.now() + 120_000;
  h.client.history.mockRejectedValue(
    new ApiError("Rate limited", 429, retryAt),
  );
  await expect(h.provider.get("42", defaults(), "plain")).rejects.toMatchObject(
    { status: 429, retryAt },
  );
  expect(h.client.history).toHaveBeenCalledTimes(1);
  expect(h.client.friends).not.toHaveBeenCalled();
});
it("resetting for a different account never reuses the prior account's friend matches", async () => {
  const h = harness();
  expect(
    (await h.provider.get("42", defaults(), "plain")).interestedFriends,
  ).toBe(1);
  h.provider.reset();
  h.client.account.mockResolvedValue({
    key: "otherplayer",
    handle: "OtherPlayer",
  });
  expect(
    (await h.provider.get("42", defaults(), "plain")).interestedFriends,
  ).toBe(0);
  expect(h.client.insights).toHaveBeenCalledTimes(1);
});

it("reuses the quest catalog across cards, honors its toggle and keeps failures separate", async () => {
  const h = harness();
  const questOnly = {
    showSaleHistoryOverlay: false,
    showFriendInterestOverlay: false,
    showQuestOverlay: true,
  };
  expect(await h.provider.get("42", questOnly, "plain")).toEqual({
    saleHistory: false,
    interestedFriends: 0,
    quest: true,
  });
  expect((await h.provider.get("43", questOnly, "plain")).quest).toBe(false);
  expect(h.client.questSubjects).toHaveBeenCalledTimes(1);
  expect(h.client.history).not.toHaveBeenCalled();
  expect(h.client.friends).not.toHaveBeenCalled();
  h.provider.reset();
  h.client.questSubjects.mockRejectedValue(
    new ApiError("Quest catalog unavailable", 403),
  );
  expect(await h.provider.get("42", defaults(), "plain")).toEqual({
    saleHistory: true,
    interestedFriends: 1,
    quest: false,
  });
});
it("pauses on quest throttling and discards a canceled catalog after reset", async () => {
  const h = harness();
  h.client.questSubjects.mockRejectedValueOnce(
    new ApiError("Slow down", 429, 123),
  );
  await expect(h.provider.get("42", defaults(), "plain")).rejects.toMatchObject(
    { status: 429, retryAt: 123 },
  );
  expect(h.client.history).not.toHaveBeenCalled();
  h.provider.reset();
  let release!: (ids: string[]) => void;
  h.client.questSubjects.mockImplementationOnce(
    () =>
      new Promise<string[]>((resolve) => {
        release = resolve;
      }),
  );
  const pending = h.provider.get(
    "42",
    {
      ...defaults(),
      showSaleHistoryOverlay: false,
      showFriendInterestOverlay: false,
    },
    "plain",
  );
  await Promise.resolve();
  h.provider.reset();
  release(["42"]);
  await expect(pending).rejects.toThrow();
  expect((await h.provider.get("42", defaults(), "plain")).quest).toBe(true);
});
