import { listingCopyId } from "../kosmora/my-listings";
import { validCardId } from "./services";

export const saleStatusKey = (account: string) =>
  "kosmore.saleStatus." + account;
const retention = 24 * 60 * 60_000;

export interface SaleChange {
  auctionId: string;
  subjectId?: string;
  at: number;
  kind: "listed" | "canceled";
}
interface AuctionChange {
  subjectId?: string;
  listed?: number;
  canceled?: number;
}
export type SaleChanges = Record<string, AuctionChange>;
export interface ListedCopies {
  at: number;
  auctionIds: string[];
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
    (change.kind === "listed" || change.kind === "canceled") &&
    Number.isSafeInteger(change.at) &&
    change.at > 0 &&
    change.at <= Date.now()
  );
}

export function updateSaleChanges(
  previous: SaleChanges,
  changes: SaleChange[],
  identities: { id: string; subjectId: string }[],
  now = Date.now(),
) {
  const next = { ...previous };
  for (const { auctionId, subjectId, kind, at } of changes) {
    const row = next[auctionId];
    next[auctionId] = {
      ...row,
      subjectId: row?.subjectId ?? subjectId,
      [kind]: Math.min(row?.[kind] ?? at, at),
    };
  }
  for (const { id, subjectId } of identities) {
    const auction = id.toLowerCase();
    if (next[auction] && !next[auction].subjectId)
      next[auction] = { ...next[auction], subjectId };
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
  auctionIds?: Set<string>;
  until?: number;
}
export function nativeSaleBaseline(copies: ListedCopies): SaleBaseline {
  const auctionIds = new Set(copies.auctionIds);
  return {
    at: copies.at,
    until: copies.at + retention,
    count: auctionIds.size,
    auctionIds,
  };
}
export function localSaleStatus(
  changes: SaleChanges,
  subject: string,
  baseline?: SaleBaseline,
  now = Date.now(),
) {
  const since = Math.max(baseline?.at ?? 0, now - retention);
  let count = baseline?.count ?? 0;
  let changed = false;
  for (const [id, row] of Object.entries(changes)) {
    if (row.subjectId !== subject) continue;
    const listed = (row.listed ?? 0) > since;
    const canceled = (row.canceled ?? 0) > since;
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
