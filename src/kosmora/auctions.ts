import { finishOf } from "../shared/sale-observations";
import type { Finish } from "../shared/types";
import {
  amount,
  count,
  date,
  object,
  subjectId,
  text,
  uuid,
} from "./contracts";

function listingPrice(value: unknown): string | undefined {
  try {
    return amount(value);
  } catch {
    return undefined;
  }
}

export function parseAuctionPage(value: unknown) {
  const page = object(value);
  if (!Array.isArray(page.items))
    throw new Error("Active auctions are unavailable.");
  return {
    items: page.items.map((value) => {
      const item = object(value);
      const card = object(item.card);
      return {
        id: uuid(item.id),
        subjectId: subjectId(card.subjectId),
        // Non-standard copies carry top-level flags (`veil: true`, checked live 2026-11-05).
        finish: finishOf({
          veil: item.veil,
          fullArt: item.fullArt ?? card.fullArt,
        }),
        state: text(item.state),
        endsAt: date(item.endsAt),
        price: listingPrice(item.bestBid ?? item.startPrice),
      };
    }),
    nextOffset: page.nextOffset === null ? null : count(page.nextOffset),
  };
}

export type AuctionListing = ReturnType<
  typeof parseAuctionPage
>["items"][number];

export async function activeAuctionSummary(
  id: string,
  name: string,
  read: (path: string) => Promise<unknown>,
): Promise<{
  count: number;
  lowestPrice?: string;
  listings: AuctionListing[];
}> {
  id = subjectId(id);
  if (!name.trim()) throw new Error("The card name is unavailable.");
  const listings = new Map<
    string,
    ReturnType<typeof parseAuctionPage>["items"][number]
  >();
  let offset = 0;
  for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
    // Match the native Find at Market search, then filter by ID: names and
    // keywords alone can match other cards, and total includes those matches.
    const query = new URLSearchParams({
      q: name,
      sort: "ending",
      offset: String(offset),
    });
    const page = parseAuctionPage(await read(`/auctions?${query}`));
    for (const item of page.items) listings.set(item.id, item);
    if (page.nextOffset === null) {
      const now = Date.now();
      const active = [...listings.values()].filter(
        (item) =>
          item.subjectId === id &&
          item.state === "open" &&
          Date.parse(item.endsAt) > now,
      );
      // A hidden/malformed price must not turn a partial minimum into a claim
      // about the lowest price, or disable the independent auction count.
      const prices = active.map((item) => item.price);
      const lowestPrice =
        prices.length && prices.every((p) => p !== undefined)
          ? prices.reduce((low, price) =>
              BigInt(price!) < BigInt(low!) ? price : low,
            )
          : undefined;
      return {
        count: active.length,
        ...(lowestPrice !== undefined ? { lowestPrice } : {}),
        listings: active,
      };
    }
    if (page.nextOffset <= offset)
      throw new Error("The market returned an unfamiliar result page.");
    offset = page.nextOffset;
  }
  throw new Error(
    "The market search is too broad to count all active auctions.",
  );
}

export async function countActiveAuctions(
  id: string,
  name: string,
  read: (path: string) => Promise<unknown>,
): Promise<number> {
  return (await activeAuctionSummary(id, name, read)).count;
}

export interface ObservedAuction {
  id: string;
  subjectId: string;
  finish: Finish;
  outcome: "open" | "sold" | "unsold";
  endsAt: number;
}
// Withdrawn listings never reached a buyer decision, so they do not count either way.
const IGNORED_STATES = new Set([
  "cancelled",
  "canceled",
  "withdrawn",
  "removed",
]);

function observedAuction(value: unknown): ObservedAuction | null {
  try {
    const item = object(value);
    const card = object(item.card);
    const state = text(item.state).toLowerCase();
    if (IGNORED_STATES.has(state)) return null;
    const endsAt = Date.parse(date(item.endsAt));
    const outcome =
      state === "open"
        ? "open"
        : state === "sold" || (item.finalPrice ?? null) !== null
          ? "sold"
          : "unsold";
    return {
      id: uuid(item.id).toLowerCase(),
      subjectId: subjectId(card.subjectId),
      finish: finishOf({
        veil: item.veil,
        fullArt: item.fullArt ?? card.fullArt,
      }),
      outcome,
      endsAt,
    };
  } catch {
    return null;
  }
}

/**
 * Reads listings from an auction page (`{items}`) or a single auction, skipping
 * malformed entries instead of rejecting the whole response.
 */
export function parseObservedAuctions(value: unknown): ObservedAuction[] {
  if (!value || typeof value !== "object") return [];
  const items = (value as { items?: unknown }).items;
  const list = Array.isArray(items) ? items : [value];
  return list.flatMap((item) => {
    const auction = observedAuction(item);
    return auction ? [auction] : [];
  });
}
