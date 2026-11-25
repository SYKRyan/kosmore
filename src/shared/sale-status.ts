import { LISTING_FRESH_MS, listingCopyId } from "../kosmora/my-listings";
import { validCardId } from "./services";
import type { ServicesListing } from "./services";
import type { Finish } from "./types";

export const validFinish = (value: unknown): value is Finish =>
  value === "plain" || value === "veil" || value === "fullart";

export const saleStatusKey = (account: string) =>
  "kosmore.saleStatus." + account;
const retention = 24 * 60 * 60_000;

export interface SaleChange {
  auctionId: string;
  startPrice?: string;
  finish?: Finish;
  subjectId?: string;
  copyId?: string;
  relistOf?: string;
  at: number;
  kind: "listed" | "canceled";
}
interface AuctionChange {
  startPrice?: string;
  finish?: Finish;
  subjectId?: string;
  copyId?: string;
  relistOf?: string;
  listed?: number;
  canceled?: number;
}
export type SaleChanges = Record<string, AuctionChange>;
export interface ListedCopies {
  at: number;
  auctionIds: string[];
  finishes?: Record<string, Finish>;
}
export interface SaleStatusCache {
  changes: SaleChanges;
  copies: Record<string, ListedCopies>;
}
export function validSaleChange(change: SaleChange) {
  return (
    !!change &&
    typeof change.auctionId === "string" &&
    listingCopyId(change.auctionId) === change.auctionId &&
    (change.subjectId === undefined || validCardId(change.subjectId)) &&
    (change.finish === undefined || validFinish(change.finish)) &&
    (change.startPrice === undefined ||
      (change.kind === "listed" && typeof change.startPrice === "string" && /^\d+$/.test(change.startPrice))) &&
    (change.copyId === undefined ||
      listingCopyId(change.copyId) === change.copyId) &&
    (change.relistOf === undefined ||
      listingCopyId(change.relistOf) === change.relistOf) &&
    (change.kind === "listed" || change.kind === "canceled") &&
    Number.isSafeInteger(change.at) &&
    change.at > 0 &&
    change.at <= Date.now()
  );
}

export function updateSaleChanges(
  previous: SaleChanges,
  changes: SaleChange[],
  identities: { id: string; subjectId: string; copyId?: string; finish?: Finish; startPrice?: string }[],
  now = Date.now(),
) {
  const next = { ...previous };
  for (const { auctionId, subjectId, copyId, relistOf, kind, at, finish, startPrice } of changes) {
    const row = next[auctionId];
    next[auctionId] = {
      ...row,
      subjectId: row?.subjectId ?? subjectId,
      ...(finish && { finish }),
      ...(startPrice !== undefined && kind === "listed" && { startPrice }),
      ...(copyId && { copyId }),
      ...(relistOf && { relistOf }),
      [kind]: Math.min(row?.[kind] ?? at, at),
    };
  }
  const byAuction = new Map(Object.entries(next));
  for (const item of identities) {
    const id = item.id.toLowerCase();
    byAuction.set(id, { ...byAuction.get(id), ...item });
  }
  const byCopy = new Map<string, string>();
  const copyFinishes = new Map<string, Finish>();
  for (const item of byAuction.values())
    if (item.copyId && item.finish) copyFinishes.set(item.copyId, item.finish);
  for (const { copyId, subjectId } of byAuction.values())
    if (copyId && subjectId) byCopy.set(copyId, subjectId);
  for (const [id, row] of Object.entries(next)) {
    const observed = byAuction.get(id);
    const previous = row.relistOf ? byAuction.get(row.relistOf) : undefined;
    const copyId = row.copyId ?? observed?.copyId ?? previous?.copyId;
    const subjectId =
      row.subjectId ??
      observed?.subjectId ??
      previous?.subjectId ??
      (copyId && byCopy.get(copyId));
    const finish = row.finish ?? observed?.finish ?? previous?.finish ?? (copyId ? copyFinishes.get(copyId) : undefined);
    // Only the exact confirmed auction can supply its price, including on relists.
    const startPrice = row.startPrice ?? observed?.startPrice;
    if (subjectId === row.subjectId && copyId === row.copyId && finish === row.finish && startPrice === row.startPrice) continue;
    next[id] = { ...row, subjectId, copyId, ...(finish && { finish }), ...(startPrice !== undefined && { startPrice }) };
    byAuction.set(id, next[id]);
    if (subjectId && copyId) byCopy.set(copyId, subjectId);
  }
  for (const [id, row] of Object.entries(next))
    if (Math.max(row.listed ?? 0, row.canceled ?? 0) <= now - retention)
      delete next[id];
  return next;
}

// Services uses opaque auction IDs. Apply only changes after its snapshot.
// Native collection snapshots also identify the individual listed copies.
export interface SaleBaseline {
  at: number;
  count: number;
  topListing?: ServicesListing;
  auctionIds?: Set<string>;
  finishes?: Record<string, Finish>;
  until?: number;
}

/** Pick one auction consistently even when several have the same bid count. */
export function mostBidListing<T extends { bids?: number; endsAt: string; id: string }>(rows: readonly T[]): T | undefined {
  return rows.reduce<T | undefined>((best, row) => {
    if (!best) return row;
    const order = (best.bids ?? 0) - (row.bids ?? 0) ||
      Date.parse(row.endsAt) - Date.parse(best.endsAt) || row.id.localeCompare(best.id);
    return order < 0 ? row : best;
  }, undefined);
}

/** Starting prices bridge a confirmed POST and the next authoritative private snapshot. */
export function pendingListingPrice(
  changes: SaleChanges, finish: Finish, now: number, native?: SaleBaseline,
  asOf = 0, knownListings: readonly { finish: Finish; startPrice: string }[] = [],
) {
  let cheapest: bigint | undefined;
  let until = Infinity;
  for (const [id, row] of Object.entries(changes)) {
    if (!row.listed || row.canceled || row.startPrice === undefined ||
        (row.finish ?? native?.finishes?.[id]) !== finish) continue;
    const expires = row.listed + (asOf ? retention : LISTING_FRESH_MS);
    if (expires <= now) continue;
    if (native?.auctionIds && native.at > row.listed && !native.auctionIds.has(id)) continue;
    // Services can return its pre-POST data on a newer read for one freshness window.
    if (asOf >= row.listed && (asOf - row.listed > LISTING_FRESH_MS ||
        knownListings.some(listing => listing.finish === finish && listing.startPrice === row.startPrice))) continue;
    const price = BigInt(row.startPrice);
    if (cheapest === undefined || price < cheapest) cheapest = price;
    until = Math.min(until, expires);
  }
  return { cheapest, until };
}
export function nativeSaleBaseline(copies: ListedCopies): SaleBaseline {
  const auctionIds = new Set(copies.auctionIds);
  return {
    at: copies.at,
    until: copies.at + retention,
    count: auctionIds.size,
    auctionIds,
    finishes: copies.finishes,
  };
}
export function localSaleStatus(
  changes: SaleChanges,
  subject: string,
  baseline?: SaleBaseline,
  now = Date.now(),
  native?: SaleBaseline,
  finish?: Finish,
) {
  const since = Math.max(baseline?.at ?? 0, now - retention);
  let count = baseline?.count ?? 0;
  let changed = false;
  for (const [id, row] of Object.entries(changes)) {
    if (row.subjectId !== subject) continue;
    if (finish && (row.finish ?? native?.finishes?.[id]) !== finish) continue;
    const listed = (row.listed ?? 0) > since;
    const canceled = (row.canceled ?? 0) > since;
    // Services dates its cache read, which can return a pre-POST empty snapshot.
    // An exact native copy observation can settle the change within that window.
    if (
      row.listed !== undefined &&
      row.canceled === undefined &&
      baseline?.count === 0 &&
      !baseline.auctionIds &&
      row.listed >= baseline.at - LISTING_FRESH_MS &&
      row.listed > now - retention &&
      (!native || row.listed >= native.at || native.auctionIds?.has(id))
    )
      return true;
    if (!listed && !canceled) continue;
    changed = true;
    if (listed && row.canceled === undefined) return true;
    if (
      canceled &&
      (baseline?.auctionIds ? baseline.auctionIds.has(id) : !listed)
    )
      count--;
  }
  return changed ? count > 0 : undefined;
}
