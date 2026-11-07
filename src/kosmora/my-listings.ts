import {
  amount,
  count,
  date,
  object,
  subjectId,
  text,
  uuid,
} from "./contracts";
import { finishOf } from "../shared/sale-observations";
import type { Finish } from "../shared/types";
export const LISTING_GROUPS = ["selling", "sold", "unsold"] as const;
export type ListingGroup = (typeof LISTING_GROUPS)[number];
export type ListingLimits = Record<ListingGroup, number>;
export const initialListingLimits = (): ListingLimits => ({
  selling: 50,
  sold: 50,
  unsold: 50,
});
export const LISTING_FRESH_MS = 300_000;
export interface PersonalListing {
  id: string;
  subjectId: string;
  endsAt: string;
  startPrice: string;
  state: string;
  finish: Finish;
  group: ListingGroup;
}
export interface ListingBatch {
  listings: PersonalListing[];
  limits: ListingLimits;
  totals: ListingLimits;
  counts: ListingLimits;
  fetchedAt: number;
}
export interface LatestListing {
  listing: PersonalListing | null;
  checkedAt: number;
}
export interface ListingCache {
  batch?: ListingBatch;
  latest?: LatestListing;
}
export function validPersonalListing(value: unknown): value is PersonalListing {
  try {
    const v = object(value);
    uuid(v.id);
    subjectId(v.subjectId);
    date(v.endsAt);
    amount(v.startPrice);
    text(v.state);
    return (
      LISTING_GROUPS.includes(v.group as ListingGroup) &&
      ["plain", "veil", "fullart"].includes(String(v.finish))
    );
  } catch {
    return false;
  }
}
export function validListingBatch(value: unknown): value is ListingBatch {
  if (!value || typeof value !== "object") return false;
  const v = value as ListingBatch;
  return (
    validListingLimits(v.limits) &&
    Array.isArray(v.listings) &&
    v.listings.every(validPersonalListing) &&
    [v.totals, v.counts].every(
      (counts) =>
        counts &&
        LISTING_GROUPS.every(
          (group) => Number.isSafeInteger(counts[group]) && counts[group] >= 0,
        ),
    ) &&
    Number.isFinite(v.fetchedAt) &&
    v.fetchedAt >= 0
  );
}
export function validListingLimits(value: unknown): value is ListingLimits {
  if (!value || typeof value !== "object") return false;
  return LISTING_GROUPS.every((group) => {
    const n = (value as ListingLimits)[group];
    return Number.isInteger(n) && n >= 1 && n <= 1_000_000;
  });
}
export function listingPath(limits: ListingLimits) {
  return `/me/auctions?${new URLSearchParams({ sort: "newest", ...Object.fromEntries(LISTING_GROUPS.map((group) => [group, String(limits[group])])) })}`;
}
export function parseListingBatch(
  value: unknown,
  account: string,
  limits: ListingLimits,
): ListingBatch {
  const page = object(value);
  if (!Array.isArray(page.items))
    throw new Error("Your listing history is unavailable.");
  const groups = object(page.groups);
  const totals = Object.fromEntries(
    LISTING_GROUPS.map((group) => [group, count(groups[group])]),
  ) as ListingLimits;
  const seen = {
    selling: new Set<string>(),
    sold: new Set<string>(),
    unsold: new Set<string>(),
  };
  const listings = new Map<string, PersonalListing>();
  for (const value of page.items) {
    const item = object(value),
      id = uuid(item.id),
      group = text(item.group) as ListingGroup;
    if (!LISTING_GROUPS.includes(group))
      throw new Error("Your listings returned an unfamiliar group.");
    seen[group].add(id);
    if (
      !item.card ||
      item.yours !== true ||
      text(item.seller).toLowerCase() !== account
    )
      continue;
    const card = object(item.card);
    listings.set(id, {
      id,
      subjectId: subjectId(card.subjectId),
      endsAt: date(item.endsAt),
      startPrice: amount(item.startPrice),
      state: text(item.state),
      group,
      finish: finishOf({
        veil: item.veil,
        fullArt: item.fullArt ?? card.fullArt,
      }),
    });
  }
  const counts = Object.fromEntries(
    LISTING_GROUPS.map((group) => [group, seen[group].size]),
  ) as ListingLimits;
  return {
    listings: [...listings.values()],
    limits: { ...limits },
    totals,
    counts,
    fetchedAt: Date.now(),
  };
}
export const listingComplete = (batch: ListingBatch) =>
  LISTING_GROUPS.every((group) => batch.counts[group] >= batch.totals[group]);
export function unresolvedListingGroups(batch: ListingBatch, subject: string) {
  return LISTING_GROUPS.filter(
    (group) =>
      batch.counts[group] < batch.totals[group] &&
      !batch.listings.some(
        (item) => item.subjectId === subject && item.group === group,
      ),
  );
}
export function nextListingLimits(
  batch: ListingBatch,
  groups: readonly ListingGroup[] = LISTING_GROUPS,
): ListingLimits {
  const limits = { ...batch.limits };
  for (const group of groups)
    if (batch.counts[group] < batch.totals[group]) {
      limits[group] = Math.min(
        batch.totals[group],
        Math.max(limits[group] * 2, 50),
      );
      if (limits[group] <= batch.limits[group])
        throw new Error(
          "Your listing history stopped before all auctions were returned.",
        );
    }
  return limits;
}
