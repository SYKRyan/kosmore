import type { CardView, ServicesCard, ServicesListing } from "./services";
import type { AuctionPrice, Finish, SaleHighlight } from "./types";

/** Public rows omit seller IDs. Match only the same finish, price and expiry,
 * consuming one public row per personal listing so a tied rival still counts. */
function lowestOtherListing(rows: ServicesCard["auctions"], mine: ServicesListing[]) {
  const groups = new Map<string, { total: number; byBids: Map<number | undefined, number> }>();
  const key = (row: { price?: string; endsAt: string }) => Date.parse(row.endsAt) + ":" + row.price;
  for (const row of mine) {
    const id = key(row);
    const group = groups.get(id) ?? { total: 0, byBids: new Map() };
    group.total++;
    group.byBids.set(row.bids, (group.byBids.get(row.bids) ?? 0) + 1);
    groups.set(id, group);
  }
  // Match equal bid counts first. The public bid count can lag the private one.
  const unmatched = rows.filter(row => {
    const group = groups.get(key(row));
    const exact = group?.byBids.get(row.bids);
    if (!group || !exact) return true;
    group.byBids.set(row.bids, exact - 1);
    group.total--;
    return false;
  });
  let lowest: AuctionPrice | undefined;
  for (const row of unmatched) {
    const group = groups.get(key(row));
    if (group && group.total > 0) group.total--;
    else if (!lowest || BigInt(row.price) < BigInt(lowest.price))
      lowest = { price: row.price, bids: row.bids };
  }
  return lowest;
}

export function summarizeAuctions(
  view: CardView,
  mine: CardView | undefined,
  finish: Finish,
  now: number,
  pending?: { cheapest?: bigint; until: number },
) {
  let count = 0;
  let lowestListing: AuctionPrice | undefined;
  let until = Infinity;
  const publicRows: ServicesCard["auctions"] = [];
  for (const row of view.card?.auctions ?? []) {
    const end = Date.parse(row.endsAt);
    if (end <= now) continue;
    if (!row.finish) return; // Older cached snapshots lack finish information.
    if (row.finish !== finish) continue;
    publicRows.push(row);
    until = Math.min(until, end);
    count++;
    if (!lowestListing || BigInt(row.price) < BigInt(lowestListing.price))
      lowestListing = { price: row.price, bids: row.bids };
  }
  let highlight: SaleHighlight | undefined;
  const floor = lowestListing && BigInt(lowestListing.price);
  let cheapest = pending?.cheapest;
  let pricesComplete = true;
  let tied: AuctionPrice | undefined;
  const ownRows: ServicesListing[] = [];
  if (pending) until = Math.min(until, pending.until);
  if (mine?.listings && (mine.listingsUntil ?? 0) > now) {
    until = Math.min(until, mine.listingsUntil!);
    for (const row of mine.listings) {
      const end = Date.parse(row.endsAt);
      if (row.finish !== finish || end <= now) continue;
      ownRows.push(row);
      until = Math.min(until, end);
      if (row.bids && row.bids > 0) highlight = "bid";
      if (row.price === undefined) {
        pricesComplete = false;
        continue;
      }
      const price = BigInt(row.price);
      if (cheapest === undefined || price < cheapest) cheapest = price;
      if (price === floor && (!tied || (row.bids ?? -1) > (tied.bids ?? -1)))
        tied = { price: lowestListing!.price, bids: row.bids };
    }
  }
  if (view.card && !view.stale && view.until > now) {
    until = Math.min(until, view.until);
    if (tied) {
      const competitor = lowestOtherListing(publicRows, ownRows);
      lowestListing = competitor ?? tied;
      if (!competitor && publicRows.length === 1 && ownRows.length === 1)
        lowestListing = { ...tied, soleOwnListing: true };
    }
    if (!highlight && cheapest !== undefined) {
      if (floor === undefined && pending?.cheapest !== undefined) highlight = "lowest";
      if (floor !== undefined) {
        if (cheapest <= floor) highlight = "lowest";
        else if (pricesComplete) highlight = "undercut";
      }
    }
  }
  return { count, lowestListing, highlight, until };
}
