import { expect, it } from "vitest";
import { summarizeAuctions } from "../../src/shared/auction-summary";
import { pendingListingPrice, updateSaleChanges, type SaleChanges } from "../../src/shared/sale-status";
import {
  parseServicesCard,
  parseServicesListings,
  type CardView,
} from "../../src/shared/services";
import { serviceRow } from "../fixtures/services";

const now = Date.parse("2026-11-25");
function snapshot(price: string | undefined, bids: number | null) {
  const row = serviceRow("42", now);
  const card = parseServicesCard(row.details, "42");
  const listings = parseServicesListings(
    [{ ...row.myListings[0], finish: "plain", price, bids }],
    "42",
  );
  return {
    card,
    listings,
    listingsUntil: now + 300000,
    stale: false,
    until: now + 300000,
  } satisfies CardView;
}

it("keeps the public minimum when a more expensive owned auction has bids", () => {
  const view = snapshot("10000000", 2);
  expect(summarizeAuctions(view, view, "plain", now)).toMatchObject({
    lowestListing: { price: "7500000", bids: 3 },
    highlight: "bid",
  });
  expect(summarizeAuctions(view, view, "veil", now)?.highlight).toBeUndefined();
});

it.each([0, 1, 9, 10, null])(
  "uses the owned bid count on a tie (%s)",
  (bids) => {
    const view = snapshot("7500000", bids);
    expect(summarizeAuctions(view, view, "plain", now)).toMatchObject({
    lowestListing: { price: "7500000", bids: bids ?? undefined, soleOwnListing: true },
      highlight: bids ? "bid" : "lowest",
    });
  },
);

it("prefers the largest owned bid count at the floor and checks any owned bid for the status", () => {
  const view = snapshot("7500000", 0);
  view.listings.push({ ...view.listings[0], bids: 10 });
  expect(summarizeAuctions(view, view, "plain", now)?.lowestListing?.bids).toBe(
    10,
  );
  view.listings[1].price = "9000000";
  expect(summarizeAuctions(view, view, "plain", now)).toMatchObject({
    highlight: "bid",
    lowestListing: { bids: 0 },
  });
});

it("skips each matched personal auction and keeps a competing tie with its own bids", () => {
  const view = snapshot("7500000", 3);
  const first = view.card.auctions[0];
  view.card.auctions.push({ ...first, price: "8000000" }, { ...first, price: "9000000", bids: 4 });
  view.listings.push({ ...view.listings[0], price: "8000000" });
  const summary = () => summarizeAuctions(view, view, "plain", now);
  expect(summary()?.lowestListing).toEqual({ price: "9000000", bids: 4 });
  view.card.auctions.unshift({ ...first, bids: 5 });
  expect(summary()?.lowestListing).toEqual({ price: "7500000", bids: 5 });
  view.listings = [];
  expect(summary()?.lowestListing).toEqual({ price: "7500000", bids: 5 });
});

it("highlights the price only for a sole confirmed owned listing", () => {
  const view = snapshot("7500000", 3);
  const price = () => summarizeAuctions(view, view, "plain", now)?.lowestListing;
  expect(price()?.soleOwnListing).toBe(true);
  expect(summarizeAuctions({ ...view, stale: true }, view, "plain", now)?.lowestListing?.soleOwnListing).toBeUndefined();
  view.card.auctions.push({ ...view.card.auctions[0] });
  expect(price()?.soleOwnListing).toBeUndefined();
  view.listings.push({ ...view.listings[0], id: "a".repeat(24) });
  expect(price()?.soleOwnListing).toBeUndefined();
});

it("warns only with a usable comparison, excluding ended and stale listings", () => {
  const view = snapshot("9000000", 0);
  expect(summarizeAuctions(view, view, "plain", now)?.highlight).toBe(
    "undercut",
  );
  const summary = () => summarizeAuctions(view, view, "plain", now)?.highlight;
  view.listings[0].price = undefined;
  expect(summary()).toBeUndefined();
  view.listings[0].bids = 1;
  view.listings[0].endsAt = new Date(now).toISOString();
  expect(summary()).toBeUndefined();
  view.listings[0].endsAt = "2099-01-01";
  view.listingsUntil = now;
  expect(summary()).toBeUndefined();
});

it("compares confirmed prices by finish until private prices catch up", () => {
  const changes: SaleChanges = {
    a: { subjectId: "42", finish: "plain", listed: now, startPrice: "9000000" },
    b: { subjectId: "42", finish: "veil", listed: now, startPrice: "1" },
  };
  const view = snapshot("9000000", 1);
  const pending = () => pendingListingPrice(changes, "plain", now + 1);
  const compare = () => summarizeAuctions(view, undefined, "plain", now + 1, pending())?.highlight;
  expect(compare()).toBe("undercut");
  changes.c = { subjectId: "42", finish: "plain", listed: now, startPrice: "7500000" };
  expect(compare()).toBe("lowest");
  expect(summarizeAuctions(view, view, "plain", now + 1, pending())?.highlight).toBe("bid");
  changes.c.canceled = now + 1;
  expect(compare()).toBe("undercut");
  expect(pendingListingPrice(changes, "plain", now + 2, undefined, now + 1, [])?.cheapest).toBe(9000000n);
  expect(pendingListingPrice(changes, "plain", now + 2, undefined, now + 1, [
    { finish: "plain", startPrice: "9000000" },
  ]).cheapest).toBeUndefined();
  expect(pendingListingPrice(changes, "plain", now + 300001, undefined, now + 300001).cheapest).toBeUndefined();
  expect(pendingListingPrice(changes, "plain", now + 2, { at: now + 1, count: 0, auctionIds: new Set() }).cheapest).toBeUndefined();
  view.card.auctions = [];
  expect(compare()).toBe("lowest");
  expect(summarizeAuctions({ ...view, stale: true }, undefined, "plain", now + 1, pending())?.highlight).toBeUndefined();
});

it("enriches a price-less confirmation only from the same auction", () => {
  const prior = { old: { listed: now - 1, subjectId: "42", finish: "plain" as const, startPrice: "100" } };
  const relist = { auctionId: "new", relistOf: "old", at: now, kind: "listed" as const };
  const next = updateSaleChanges(prior, [relist], [], now);
  expect(next.new.startPrice).toBeUndefined();
  const enriched = updateSaleChanges(next, [], [{ id: "new", subjectId: "42", startPrice: "125" }], now);
  expect(enriched.new.startPrice).toBe("125");
});
