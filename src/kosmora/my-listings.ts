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
  copyId?: string;
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
  startedAt?: number;
}
export const LISTING_REFRESH_WINDOW = 180;
export const SAVED_LISTING_LIMIT = 100;
export interface TrackedListing {
  id: string;
  copyId?: string;
  group?: ListingGroup;
  startPrice: string;
  submittedAt?: number;
  endsAt?: string;
  finish?: Finish;
  state?: string;
}
export interface TrackedListingHistory {
  listings: TrackedListing[];
  hasMore: boolean;
}
interface ListingOutcome {
  group: ListingGroup;
  state: string;
  endsAt: string;
}
export interface ListingMetadata {
  copyId?: string;
  outcome?: ListingOutcome;
}
export const LISTING_REFRESH_LABEL = "Refresh my listing history";
export function listingCopyId(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    return uuid(value).toLowerCase();
  } catch {
    return undefined;
  }
}

export function auctionCopyId(
  auction: Record<string, unknown>,
  card: Record<string, unknown>,
) {
  return (
    listingCopyId((auction.copy as { id?: unknown } | undefined)?.id) ??
    listingCopyId(
      auction.instanceId ??
        auction.cardInstanceId ??
        auction.copyId ??
        card.instanceId ??
        card.copyId ??
        card.id,
    )
  );
}

const canceled = (state?: string) => /^cancel/i.test(state ?? "");
function listingGroupForState(state?: string): ListingGroup | undefined {
  if (state === "expired" || canceled(state)) return "unsold";
  if (state === "sold") return "sold";
  if (state === "open") return "selling";
}

export function auctionListingOutcome(
  auction: Record<string, unknown>,
): ListingOutcome | undefined {
  const { state, endsAt } = auction;
  if (
    typeof state !== "string" ||
    typeof endsAt !== "string" ||
    !Number.isFinite(Date.parse(endsAt))
  )
    return;
  const group = listingGroupForState(state);
  if (group) return { group, state, endsAt };
}

export function validListingMetadata(value: unknown): value is ListingMetadata {
  if (!value || typeof value !== "object") return false;
  const { copyId, outcome } = value as ListingMetadata;
  return (
    (copyId !== undefined || outcome !== undefined) &&
    (copyId === undefined ||
      (typeof copyId === "string" && listingCopyId(copyId) === copyId)) &&
    (outcome === undefined ||
      (!!outcome &&
        typeof outcome === "object" &&
        auctionListingOutcome({ state: outcome.state, endsAt: outcome.endsAt })
          ?.group === outcome.group &&
        LISTING_GROUPS.includes(outcome.group)))
  );
}

export function applyListingMetadata(
  row: TrackedListing,
  metadata: ListingMetadata,
): TrackedListing {
  const copyId = metadata.copyId ?? row.copyId;
  const group = row.group ?? listingGroupForState(row.state);
  const outcome =
    group === "sold" || group === "unsold" ? undefined : metadata.outcome;
  if (
    copyId === row.copyId &&
    (!outcome ||
      (row.group === outcome.group &&
        row.state === outcome.state &&
        row.endsAt === outcome.endsAt))
  )
    return row;
  return outcome
    ? { ...row, copyId, group: outcome.group, state: outcome.state, endsAt: outcome.endsAt }
    : { ...row, copyId };
}

export async function failedListingPrice(
  listings: TrackedListing[],
  copyId: string,
  threshold: number,
  resolveMetadata?: (auctionId: string) => Promise<ListingMetadata | undefined>,
): Promise<string | undefined> {
  const now = Date.now();
  const candidates = listings
    .filter(
      (row) => (!row.copyId || row.copyId === copyId) && !canceled(row.state),
    )
    .map((row) => {
      const group = row.group ?? listingGroupForState(row.state);
      const needsOutcome =
        !group || (group === "selling" && Date.parse(row.endsAt ?? "") <= now);
      return {
        row,
        needsOutcome,
        couldCount: needsOutcome || group === "unsold",
      };
    });
  let remaining = candidates.filter(({ couldCount }) => couldCount).length;
  let count = 0;
  let lastPrice: string | undefined;
  for (const { row, needsOutcome, couldCount } of candidates) {
    if (count + remaining < threshold) break;
    if (couldCount) remaining--;
    const metadata =
      !row.copyId || needsOutcome ? await resolveMetadata?.(row.id) : undefined;
    const listing = metadata ? applyListingMetadata(row, metadata) : row;
    if (canceled(listing.state)) continue;
    const unsold =
      (listing.group ?? listingGroupForState(listing.state)) === "unsold";
    if (listing.copyId !== copyId) {
      // An unresolved row may hide a newer price or an outcome that ends the streak.
      if (!listing.copyId && (!unsold || lastPrice === undefined)) break;
      continue;
    }
    if (!unsold) break;
    lastPrice ??= listing.startPrice;
    if (++count >= threshold) return lastPrice;
  }
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
      (v.copyId === undefined || listingCopyId(v.copyId) === v.copyId) &&
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
    (v.startedAt === undefined ||
      (Number.isFinite(v.startedAt) && v.startedAt >= 0)) &&
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
  const relistItems = (page.relistAll as { items?: unknown } | undefined)
    ?.items;
  const relistCopies = new Map<string, string>();
  if (Array.isArray(relistItems)) {
    for (const value of relistItems) {
      const item = value as {
        auctionId?: unknown;
        instanceId?: unknown;
      } | null;
      const id = listingCopyId(item?.auctionId);
      const copy = listingCopyId(item?.instanceId);
      if (id && copy) relistCopies.set(id, copy);
    }
  }
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
      copyId: auctionCopyId(item, card) ?? relistCopies.get(id.toLowerCase()),
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
