import { afterEach, expect, it, vi } from "vitest";
import {
  countActiveAuctions,
  activeAuctionSummary,
  parseAuctionPage,
} from "../../src/kosmora/auctions";
import { GameClient } from "../../src/kosmora/client";
import { auction, auctionPage } from "../fixtures/auctions";

const withoutListings = <T extends { listings: unknown }>({
  listings: _listings,
  ...summary
}: T) => summary;

afterEach(() => vi.restoreAllMocks());

it("finds the lowest current listing price using bids before starting prices and exact active subjects", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      items: [
        auction(1, "42", { startPrice: "1000000", bestBid: "25000000" }),
        auction(2, "43", { startPrice: "1" }),
        auction(3, "42", { startPrice: "1", state: "sold" }),
        auction(4, "42", {
          startPrice: "1",
          endsAt: new Date(Date.now() - 1000).toISOString(),
        }),
      ],
      nextOffset: 4,
    })
    .mockResolvedValueOnce({
      items: [
        auction(5, "42", { startPrice: "12000000", bestBid: null }),
        auction(6, "42", { startPrice: "9007199254740993123456" }),
      ],
      nextOffset: null,
    });
  const summary = await activeAuctionSummary("42", "Card", read);
  expect(summary).toMatchObject({ count: 3, lowestPrice: "12000000" });
  // Only exact-subject, open, unexpired listings are exposed for observation.
  expect(summary.listings.map((l) => l.id)).toEqual(
    [1, 5, 6].map((n) => auction(n).id),
  );
  expect(summary.listings[0]).toMatchObject({
    subjectId: "42",
    finish: "plain",
  });
});
it("keeps counts but omits a lowest price when any matching active listing has unavailable pricing", async () => {
  for (const price of [undefined, null, "hidden", -1]) {
    expect(
      withoutListings(
        await activeAuctionSummary("42", "Card", async () => ({
          items: [auction(1), auction(2, "42", { startPrice: price })],
          nextOffset: null,
        })),
      ),
    ).toEqual({ count: 2 });
  }
  expect(
    withoutListings(
      await activeAuctionSummary("42", "Card", async () => ({
        items: [],
        nextOffset: null,
      })),
    ),
  ).toEqual({ count: 0 });
  expect(
    withoutListings(
      await activeAuctionSummary("42", "Card", async () => ({
        items: [auction(1, "42", { startPrice: "0" })],
        nextOffset: null,
      })),
    ),
  ).toEqual({ count: 1, lowestPrice: "0" });
});

it("counts exact-card open listings across all pages and finishes without counting unrelated search matches or duplicate auctions", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      items: [
        auction(1),
        auction(2, "43"),
        auction(3, "42", { state: "sold" }),
      ],
      nextOffset: 3,
      total: 99,
    })
    .mockResolvedValueOnce({
      items: [
        auction(1),
        auction(4, "42", { veil: true }),
        auction(5, "42", { card: { subjectId: "42", fullArt: {} } }),
        auction(6, "42", { endsAt: new Date(Date.now() - 1000).toISOString() }),
      ],
      nextOffset: null,
      total: 99,
    });
  expect(await countActiveAuctions("00042", "A & B, C", read)).toBe(3);
  expect(read).toHaveBeenCalledTimes(2);
  const second = new URL(read.mock.calls[1][0], "https://kosmora.io");
  expect(second.searchParams.get("q")).toBe("A & B, C");
  expect(second.searchParams.get("sort")).toBe("ending");
  expect(second.searchParams.get("offset")).toBe("3");
});
it("returns zero only after a successful complete search", async () => {
  expect(
    await countActiveAuctions("42", "Card", async () => ({
      items: [],
      nextOffset: null,
      total: 0,
    })),
  ).toBe(0);
  const read = vi
    .fn()
    .mockResolvedValueOnce({ items: [auction(1)], nextOffset: 1 })
    .mockRejectedValueOnce(new Error("unavailable"));
  await expect(countActiveAuctions("42", "Card", read)).rejects.toThrow(
    "unavailable",
  );
});
it("rejects malformed results and pagination without returning a partial count", async () => {
  for (const page of [
    {},
    { items: [], nextOffset: -1 },
    { items: [], nextOffset: "1" },
    { items: [{ ...auction(1), card: null }], nextOffset: null },
    { items: [auction(1, "42", { endsAt: "invalid" })], nextOffset: null },
  ])
    expect(() => parseAuctionPage(page)).toThrow();
  await expect(
    countActiveAuctions("42", "Card", async () => ({
      items: [],
      nextOffset: 0,
    })),
  ).rejects.toThrow("result page");
});
it("caches auction reads for 60 seconds, refreshes explicitly, and isolates accounts", async () => {
  let account = "FirstPlayer";
  const fetcher = vi.fn(async (input: RequestInfo | URL) =>
    Response.json(
      String(input) === "/api/me" ? { handle: account } : auctionPage(),
    ),
  );
  const client = new GameClient(fetcher as typeof fetch);
  await client.account();
  expect(await client.activeAuctions("42", "Card")).toBe(2);
  expect(await client.lowestListingPrice("42", "Card")).toBe("10000000");
  await client.activeAuctions("42", "Card");
  expect(fetcher).toHaveBeenCalledTimes(2);
  await client.activeAuctions("42", "Card", undefined, true);
  expect(fetcher).toHaveBeenCalledTimes(3);
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + 60_001);
  await client.activeAuctions("42", "Card");
  expect(fetcher).toHaveBeenCalledTimes(4);
  clock.mockRestore();
  account = "SecondPlayer";
  await client.account();
  await client.activeAuctions("42", "Card");
  expect(fetcher).toHaveBeenCalledTimes(6);
});
