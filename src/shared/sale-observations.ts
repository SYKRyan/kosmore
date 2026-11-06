import { FINISHES, type Finish, type MarketHistory } from "./types";

/**
 * Per-card, per-finish market outcomes observed while browsing. Kosmora's auction
 * search only returns open listings, so unsold auctions are never reported by the
 * API. KosMore keeps a small local log of listings it has seen instead:
 *  - the game's own auction responses (relayed by page-hook.ts) and KosMore's own
 *    auction searches record listings as open, with their exact end time;
 *  - an ending Market tile switches to `data-ended="sold"|"noSale"` (exact outcome);
 *  - price histories settle ended listings: listed in sales → sold; absent from a
 *    complete history of the listing's finish fetched well after the end → unsold.
 * Stored only in chrome.storage.local. Never sent anywhere and not part of backups.
 */
/** One storage entry per UTC day of listing end: `kosmore.marketOutcomes.YYYY-MM-DD`. */
export const OBSERVATIONS_PREFIX = "kosmore.marketOutcomes.";
const BUCKET_KEY = /^kosmore\.marketOutcomes\.\d{4}-\d{2}-\d{2}$/;
export const bucketKey = (endsAt: number) =>
  OBSERVATIONS_PREFIX + new Date(endsAt).toISOString().slice(0, 10);
export const isBucketKey = (key: string) => BUCKET_KEY.test(key);
export const SALE_RATE_DAYS = 30;
const KEEP_DAYS = 35;
const MAX_ENTRIES = 20_000;
/** Settlement margin before a missing sale is read as "no sale". */
export const SETTLE_MS = 10 * 60_000;
const DAY = 86_400_000;

export type Outcome = "open" | "sold" | "unsold";
export interface Observation {
  subjectId: string;
  finish: Finish;
  outcome: Outcome;
  /** Listing end (or when the ended tile was seen), epoch ms. */
  endsAt: number;
}
export type Observations = Map<string, Observation>;

const OUTCOMES: Outcome[] = ["open", "sold", "unsold"];
const AUCTION_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SUBJECT_ID = /^(0|[1-9]\d{0,17})$/;
const isFinish = (value: unknown): value is Finish =>
  FINISHES.includes(value as Finish);

/** Compact stored form: { v: 2, a: { auctionId: [subjectId, finish, outcomeCode, endsAt] } }. */
export function parseObservations(value: unknown): Observations {
  const result: Observations = new Map();
  if (!value || typeof value !== "object") return result;
  const { v, a } = value as { v?: unknown; a?: unknown };
  if (v !== 2 || !a || typeof a !== "object") return result;
  for (const [id, entry] of Object.entries(a)) {
    if (!AUCTION_ID.test(id) || !Array.isArray(entry) || entry.length !== 4)
      continue;
    const [subjectId, finish, code, endsAt] = entry as unknown[];
    if (
      typeof subjectId !== "string" ||
      !SUBJECT_ID.test(subjectId) ||
      !isFinish(finish) ||
      typeof code !== "number" ||
      !OUTCOMES[code] ||
      typeof endsAt !== "number" ||
      !Number.isFinite(endsAt)
    )
      continue;
    result.set(id.toLowerCase(), {
      subjectId,
      finish,
      outcome: OUTCOMES[code],
      endsAt,
    });
  }
  return result;
}

export function serializeObservations(observations: Observations) {
  const a: Record<string, [string, Finish, number, number]> = {};
  for (const [id, o] of observations)
    a[id] = [o.subjectId, o.finish, OUTCOMES.indexOf(o.outcome), o.endsAt];
  return { v: 2 as const, a };
}

/** Adds or updates one listing. A resolved outcome is never downgraded to open. */
export function recordObservation(
  observations: Observations,
  auctionId: string,
  next: Observation,
): boolean {
  const id = auctionId.toLowerCase();
  if (
    !AUCTION_ID.test(id) ||
    !SUBJECT_ID.test(next.subjectId) ||
    !isFinish(next.finish) ||
    !Number.isFinite(next.endsAt)
  )
    return false;
  const previous = observations.get(id);
  const keepPrevious =
    !!previous && previous.outcome !== "open" && next.outcome === "open";
  const merged: Observation = keepPrevious ? previous! : { ...next };
  if (
    previous &&
    previous.subjectId === merged.subjectId &&
    previous.finish === merged.finish &&
    previous.outcome === merged.outcome &&
    previous.endsAt === merged.endsAt
  )
    return false;
  observations.set(id, merged);
  return true;
}

/** Combines two logs (e.g. another tab's write), keeping resolved outcomes. */
export function mergeObservations(into: Observations, from: Observations) {
  let changed = false;
  for (const [id, o] of from)
    changed = recordObservation(into, id, o) || changed;
  return changed;
}

/** Drops expired listings and enforces the size cap; returns the day keys it touched. */
export function pruneObservations(
  observations: Observations,
  now = Date.now(),
): Set<string> {
  const touched = new Set<string>();
  const cutoff = now - KEEP_DAYS * DAY;
  for (const [id, o] of observations)
    if (o.endsAt < cutoff) {
      observations.delete(id);
      touched.add(bucketKey(o.endsAt));
    }
  if (observations.size > MAX_ENTRIES) {
    const oldest = [...observations]
      .sort(([, a], [, b]) => a.endsAt - b.endsAt)
      .slice(0, observations.size - MAX_ENTRIES);
    for (const [id, o] of oldest) {
      observations.delete(id);
      touched.add(bucketKey(o.endsAt));
    }
  }
  return touched;
}

/**
 * Settles this card's ended open listings against one finish's price history,
 * fetched at `loadedAt`. Any finish can prove a sale (auction IDs are unique); only
 * a complete history of the listing's own finish, fetched after the settlement
 * margin, can prove no sale. Returns the auction IDs that changed.
 */
export function resolveWithHistory(
  observations: Observations,
  subjectId: string,
  history: MarketHistory,
  loadedAt: number,
): string[] {
  const sold = new Set(history.sales.map((s) => s.auctionId.toLowerCase()));
  const changed: string[] = [];
  for (const [id, o] of observations) {
    if (o.subjectId !== subjectId || o.outcome !== "open") continue;
    if (sold.has(id)) o.outcome = "sold";
    else if (
      o.finish === history.finish &&
      history.complete &&
      o.endsAt + SETTLE_MS < loadedAt
    )
      o.outcome = "unsold";
    else continue;
    changed.push(id);
  }
  return changed;
}

export interface FinishRate {
  sold: number;
  total: number;
  /** Whole percent, or null without any settled listing. */
  percent: number | null;
}
export type SaleRates = Record<Finish, FinishRate>;

const rate = (sold: number, total: number): FinishRate => ({
  sold,
  total,
  percent: total ? Math.round((sold / total) * 100) : null,
});

/** This card's own settled listings that ended in the trailing window, by finish. */
export function saleRates(
  observations: Observations,
  subjectId: string,
  now = Date.now(),
): SaleRates {
  const since = now - SALE_RATE_DAYS * DAY;
  const counts = Object.fromEntries(
    FINISHES.map((f) => [f, { sold: 0, total: 0 }]),
  ) as Record<Finish, { sold: number; total: number }>;
  for (const o of observations.values()) {
    if (
      o.subjectId !== subjectId ||
      o.outcome === "open" ||
      o.endsAt < since ||
      o.endsAt > now
    )
      continue;
    counts[o.finish].total++;
    if (o.outcome === "sold") counts[o.finish].sold++;
  }
  return Object.fromEntries(
    FINISHES.map((f) => [f, rate(counts[f].sold, counts[f].total)]),
  ) as SaleRates;
}

/** Combined rate across the given finishes. */
export function combinedRate(rates: SaleRates, finishes: Finish[]): FinishRate {
  let sold = 0,
    total = 0;
  for (const f of finishes) {
    sold += rates[f].sold;
    total += rates[f].total;
  }
  return rate(sold, total);
}

/** Finish of a listing from the game's copy flags; full art takes precedence. */
export function finishOf(flags: { veil?: unknown; fullArt?: unknown }): Finish {
  return flags.fullArt ? "fullart" : flags.veil === true ? "veil" : "plain";
}
