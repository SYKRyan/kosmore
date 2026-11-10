import { afterEach, expect, it, vi } from "vitest";
import { CardSignalProvider } from "../../src/content/card-signals";
import { defaults } from "../../src/shared/settings";
import { parseHistory, parseInsights } from "../../src/kosmora/contracts";
import { ApiError } from "../../src/kosmora/client";
import { card, prices } from "../fixtures/data";
import type { Finish } from "../../src/shared/types";
const iconSettings = () => ({
  ...defaults(),
  collectSaleRateData: false,
  showLastSalePriceOverlay: false,
  showLowestListingPriceOverlay: false,
});
afterEach(() => vi.unstubAllGlobals());
it("publishes independent badges while market reads are pending and withholds a partial last-sale price", async () => {
  const h = harness();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.client.history.mockImplementation(async (_id, finish) => {
    if (finish === "fullart") await held;
    return parseHistory(prices(1), finish);
  });
  const updates = vi.fn();
  const first = h.provider.get("42", defaults(), "plain", updates);
  const secondUpdates = vi.fn();
  const second = h.provider.get("42", defaults(), "veil", secondUpdates);
  await vi.waitFor(() =>
    expect(updates).toHaveBeenCalledWith(
      expect.objectContaining({ quest: true, saleHistory: true }),
    ),
  );
  expect(
    updates.mock.calls.every(([signals]) => signals.lastSale === undefined),
  ).toBe(true);
  release();
  expect((await first).lastSale).toBeDefined();
  expect(await second).toEqual(await first);
  expect(secondUpdates).toHaveBeenLastCalledWith(await first);
  expect(h.client.history).toHaveBeenCalledTimes(3);
});
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
    activeAuctions: vi.fn(async () => 0),
    lowestListingPrice: vi.fn(
      async (): Promise<string | undefined> => undefined,
    ),
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
it("keeps current listings and completed sales independent, including ordinary auction failures", async () => {
  const h = harness();
  const settings = {
    ...iconSettings(),
    showFriendInterestOverlay: false,
    showQuestOverlay: false,
  };
  h.client.activeAuctions.mockResolvedValue(2);
  h.client.history.mockImplementation(async (_id, finish) =>
    parseHistory(prices(0), finish),
  );
  expect(await h.provider.get("42", settings, "plain")).toMatchObject({
    onSale: false,
    activeAuctions: true,
    saleHistory: false,
  });
  h.provider.reset();
  h.client.activeAuctions.mockResolvedValue(0);
  h.client.history.mockImplementation(async (_id, finish) =>
    parseHistory(prices(3), finish),
  );
  expect(await h.provider.get("42", settings, "plain")).toMatchObject({
    onSale: false,
    activeAuctions: false,
    saleHistory: true,
  });
  h.provider.reset();
  h.client.activeAuctions.mockResolvedValue(2);
  expect(await h.provider.get("42", settings, "plain")).toMatchObject({
    onSale: false,
    activeAuctions: true,
    saleHistory: true,
  });
  h.provider.reset();
  h.client.activeAuctions.mockRejectedValue(new ApiError("Unavailable", 503));
  expect(await h.provider.get("42", settings, "plain")).toMatchObject({
    onSale: false,
    activeAuctions: false,
    saleHistory: true,
  });
});
it("uses the latest returned sale across every finish and loads listing prices only when requested", async () => {
  const h = harness();
  const settings = {
    ...defaults(),
    showOnSaleOverlay: false,
    showFriendInterestOverlay: false,
    showQuestOverlay: false,
  };
  h.client.activeAuctions.mockResolvedValue(2);
  h.client.lowestListingPrice.mockResolvedValue("8000000");
  h.client.history.mockImplementation(async (_id, finish) => {
    const data = prices(1);
    data.prices.sales[0].price = finish === "veil" ? "99000000" : "12000000";
    data.prices.sales[0].soldAt =
      finish === "veil" ? "2026-11-05T12:00:00Z" : "2026-11-04T12:00:00Z";
    return parseHistory(data, finish);
  });
  const result = await h.provider.get("42", settings, "plain");
  expect(result.lastSale).toMatchObject({ finish: "veil", price: "99000000" });
  expect(result.lowestListingPrice).toBe("8000000");
  expect(h.client.history.mock.calls.map((call) => call[1])).toEqual([
    "plain",
    "veil",
    "fullart",
  ]);
  expect(h.client.lowestListingPrice).toHaveBeenCalledTimes(1);
  h.provider.reset();
  const withoutPrices = await h.provider.get(
    "42",
    {
      ...settings,
      showLastSalePriceOverlay: false,
      showLowestListingPriceOverlay: false,
    },
    "plain",
  );
  expect(withoutPrices).toMatchObject({
    saleHistory: true,
    activeAuctions: true,
  });
  expect(withoutPrices.lastSale).toBeUndefined();
  expect(withoutPrices.lowestListingPrice).toBeUndefined();
  expect(h.client.lowestListingPrice).toHaveBeenCalledTimes(1);
});
it("retains confirmed icons but hides uncertain prices after history or listing-price failures", async () => {
  const h = harness();
  h.client.history.mockImplementation(async (_id, finish) => {
    if (finish === "veil") throw new ApiError("Unavailable", 503);
    return parseHistory(prices(1), finish);
  });
  h.client.activeAuctions.mockResolvedValue(2);
  h.client.lowestListingPrice.mockRejectedValue(
    new ApiError("Unavailable", 503),
  );
  const result = await h.provider.get(
    "42",
    {
      ...defaults(),
      showOnSaleOverlay: false,
      showFriendInterestOverlay: false,
      showQuestOverlay: false,
    },
    "plain",
  );
  expect(result.saleHistory).toBe(true);
  expect(result.activeAuctions).toBe(true);
  expect(result.lastSale).toBeUndefined();
  expect(result.lowestListingPrice).toBeUndefined();
});
it("shows On Sale only for your own listed copies, independently of public auction counts", async () => {
  const h = harness();
  const settings = {
    ...iconSettings(),
    showSaleHistoryOverlay: false,
    showFriendInterestOverlay: false,
    showQuestOverlay: false,
  };
  h.client.activeAuctions.mockResolvedValue(2);
  expect(await h.provider.get("42", settings, "plain")).toMatchObject({
    onSale: false,
    activeAuctions: true,
  });
  h.provider.reset();
  const source = card();
  h.client.insights.mockResolvedValue(
    parseInsights({
      ...source,
      copies: [
        {
          ...source.copies[0],
          state: "escrow",
          auction_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        },
      ],
    }),
  );
  h.client.activeAuctions.mockResolvedValue(0);
  expect(await h.provider.get("42", settings, "veil")).toMatchObject({
    onSale: true,
    activeAuctions: false,
  });
  expect(h.client.insights).toHaveBeenLastCalledWith(
    "42",
    expect.any(AbortSignal),
    false,
  );
  h.provider.reset();
  h.client.account.mockResolvedValue({
    key: "otherplayer",
    handle: "OtherPlayer",
  });
  h.client.insights.mockResolvedValue(parseInsights({ ...source, copies: [] }));
  expect((await h.provider.get("42", settings, "plain")).onSale).toBe(false);
});
it("can check On Sale by itself and skips the check when its toggle is off", async () => {
  const h = harness();
  const settings = {
    ...iconSettings(),
    showActiveAuctionsOverlay: false,
    showSaleHistoryOverlay: false,
    showFriendInterestOverlay: false,
    showQuestOverlay: false,
  };
  await h.provider.get("42", settings, "plain");
  expect(h.client.insights).toHaveBeenCalledTimes(1);
  expect(h.client.activeAuctions).not.toHaveBeenCalled();
  expect(h.client.history).not.toHaveBeenCalled();
  h.provider.reset();
  await h.provider.get(
    "42",
    { ...settings, showOnSaleOverlay: false },
    "plain",
  );
  expect(h.client.insights).toHaveBeenCalledTimes(1);
  h.provider.reset();
  h.client.insights.mockRejectedValue(new ApiError("Unavailable", 503));
  expect((await h.provider.get("42", settings, "plain")).onSale).toBe(false);
  h.provider.reset();
  h.client.insights.mockRejectedValue(new ApiError("Sign in", 401));
  await expect(h.provider.get("42", settings, "plain")).rejects.toMatchObject({
    status: 401,
  });
});
it("honors the auction toggle independently and propagates market throttling", async () => {
  const h = harness();
  h.client.activeAuctions.mockResolvedValue(3);
  await h.provider.get(
    "42",
    { ...iconSettings(), showActiveAuctionsOverlay: false },
    "plain",
  );
  expect(h.client.activeAuctions).not.toHaveBeenCalled();
  h.provider.reset();
  h.client.activeAuctions.mockRejectedValue(
    new ApiError("Slow down", 429, 123),
  );
  await expect(
    h.provider.get("42", iconSettings(), "plain"),
  ).rejects.toMatchObject({ status: 429, retryAt: 123 });
});
it("deduplicates card checks and stops sale-history reads after the first confirmed positive", async () => {
  const h = harness();
  const result = await Promise.all([
    h.provider.get("42", iconSettings(), "plain"),
    h.provider.get("42", iconSettings(), "veil"),
  ]);
  expect(result).toEqual([
    {
      onSale: false,
      activeAuctions: false,
      saleHistory: true,
      interestedFriends: 1,
      quest: true,
    },
    {
      onSale: false,
      activeAuctions: false,
      saleHistory: true,
      interestedFriends: 1,
      quest: true,
    },
  ]);
  expect(h.client.account).toHaveBeenCalledTimes(1);
  expect(h.client.history).toHaveBeenCalledTimes(1);
  expect(h.client.insights).toHaveBeenCalledTimes(1);
});
it("does no game reads when the overlay section is disabled even with individual signals enabled", async () => {
  const h = harness();
  expect(
    await h.provider.get(
      "42",
      { ...iconSettings(), cardOverlaysEnabled: false },
      "plain",
    ),
  ).toEqual({
    onSale: false,
    activeAuctions: false,
    saleHistory: false,
    interestedFriends: 0,
    quest: false,
  });
  expect(h.client.account).not.toHaveBeenCalled();
});
it("does no game reads when all overlays are disabled", async () => {
  const h = harness();
  expect(
    await h.provider.get(
      "42",
      {
        cardOverlaysEnabled: true,
        showLastSalePriceOverlay: false,
        showLowestListingPriceOverlay: false,
        showOnSaleOverlay: false,
        showActiveAuctionsOverlay: false,
        showSaleHistoryOverlay: false,
        showFriendInterestOverlay: false,
        showQuestOverlay: false,
      },
      "plain",
    ),
  ).toEqual({
    onSale: false,
    activeAuctions: false,
    saleHistory: false,
    interestedFriends: 0,
    quest: false,
  });
  expect(h.client.account).not.toHaveBeenCalled();
});
it("honors each toggle and skips card details when friends have no family preferences", async () => {
  const h = harness();
  delete h.data["kosmore.friend.fixtureplayer.batu"];
  expect(
    await h.provider.get(
      "42",
      {
        cardOverlaysEnabled: true,
        showLastSalePriceOverlay: false,
        showLowestListingPriceOverlay: false,
        showOnSaleOverlay: false,
        showActiveAuctionsOverlay: false,
        showSaleHistoryOverlay: false,
        showFriendInterestOverlay: true,
        showQuestOverlay: false,
      },
      "plain",
    ),
  ).toEqual({
    onSale: false,
    activeAuctions: false,
    saleHistory: false,
    interestedFriends: 0,
    quest: false,
  });
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
        cardOverlaysEnabled: true,
        showLastSalePriceOverlay: false,
        showLowestListingPriceOverlay: false,
        showOnSaleOverlay: false,
        showActiveAuctionsOverlay: false,
        showSaleHistoryOverlay: true,
        showFriendInterestOverlay: false,
        showQuestOverlay: false,
      },
      "veil",
    ),
  ).toEqual({
    onSale: false,
    activeAuctions: false,
    saleHistory: false,
    interestedFriends: 0,
    quest: false,
  });
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
  expect(await h.provider.get("42", iconSettings(), "plain")).toEqual({
    onSale: false,
    activeAuctions: false,
    saleHistory: false,
    interestedFriends: 1,
    quest: true,
  });
  h.provider.reset();
  h.client.history.mockImplementation(async (_id, finish) =>
    parseHistory(prices(3), finish),
  );
  h.client.friends.mockRejectedValue(new ApiError("Unavailable", 503));
  expect(await h.provider.get("42", iconSettings(), "plain")).toEqual({
    onSale: false,
    activeAuctions: false,
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
  await expect(
    h.provider.get("42", iconSettings(), "plain"),
  ).rejects.toMatchObject({ status: 429, retryAt });
  expect(h.client.history).toHaveBeenCalledTimes(1);
  // Independent lookups may have started before the server returned a cooldown.
  expect(h.client.friends).toHaveBeenCalledTimes(1);
});
it("resetting for a different account never reuses the prior account's friend matches", async () => {
  const h = harness();
  expect(
    (await h.provider.get("42", iconSettings(), "plain")).interestedFriends,
  ).toBe(1);
  h.provider.reset();
  h.client.account.mockResolvedValue({
    key: "otherplayer",
    handle: "OtherPlayer",
  });
  expect(
    (await h.provider.get("42", iconSettings(), "plain")).interestedFriends,
  ).toBe(0);
  expect(h.client.insights).toHaveBeenCalledTimes(2);
});

it("reuses the quest catalog across cards, honors its toggle and keeps failures separate", async () => {
  const h = harness();
  const questOnly = {
    cardOverlaysEnabled: true,
    showLastSalePriceOverlay: false,
    showLowestListingPriceOverlay: false,
    showOnSaleOverlay: false,
    showActiveAuctionsOverlay: false,
    showSaleHistoryOverlay: false,
    showFriendInterestOverlay: false,
    showQuestOverlay: true,
  };
  expect(await h.provider.get("42", questOnly, "plain")).toEqual({
    onSale: false,
    activeAuctions: false,
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
  expect(await h.provider.get("42", iconSettings(), "plain")).toEqual({
    onSale: false,
    activeAuctions: false,
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
  await expect(
    h.provider.get("42", iconSettings(), "plain"),
  ).rejects.toMatchObject({ status: 429, retryAt: 123 });
  expect(h.client.history).toHaveBeenCalledTimes(1);
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
      ...iconSettings(),
      showOnSaleOverlay: false,
      showActiveAuctionsOverlay: false,
      showSaleHistoryOverlay: false,
      showFriendInterestOverlay: false,
    },
    "plain",
  );
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const canceled = expect(pending).rejects.toThrow();
  h.provider.reset();
  release(["42"]);
  await canceled;
  expect((await h.provider.get("42", iconSettings(), "plain")).quest).toBe(
    true,
  );
});

it("stops at the first positive finish even while collecting settlement evidence", async () => {
  const h = harness();
  const settings = { ...iconSettings(), collectSaleRateData: true };
  await expect(h.provider.get("42", settings, "veil")).resolves.toMatchObject({
    saleHistory: true,
  });
  expect(h.client.history.mock.calls.map(([, finish]) => finish)).toEqual([
    "veil",
  ]);
});

it("reuses overlay results through 59 seconds and refreshes at 60 seconds", async () => {
  const h = harness();
  const clock = vi.spyOn(Date, "now");
  const started = Date.now();
  const settings = {
    ...iconSettings(),
    showSaleHistoryOverlay: false,
    showQuestOverlay: false,
    showFriendInterestOverlay: false,
    showActiveAuctionsOverlay: false,
    showOnSaleOverlay: true,
  };
  try {
    clock.mockReturnValue(started);
    await h.provider.get("42", settings, "plain");
    clock.mockReturnValue(started + 59_999);
    await h.provider.get("42", settings, "plain");
    expect(h.client.insights).toHaveBeenCalledOnce();
    clock.mockReturnValue(started + 60_000);
    await h.provider.get("42", settings, "plain");
    expect(h.client.insights).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});
