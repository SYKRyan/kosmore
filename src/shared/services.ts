import { amount, count, date, object, text } from "../kosmora/contracts";
import type { AuctionPrice, Finish, MarketHistory } from "./types";

export const SERVICES_STATE_KEY = "kosmore.servicesConnectionChanged";
export const validCardId = (id: unknown): id is string =>
  typeof id === "string" && /^[1-9]\d{0,17}$/.test(id);

export function servicesBase(value: string) {
  const url = new URL(value.trim());
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[?#]/.test(value) ||
    ["kosmora.io", "developers.kosmora.io"].includes(url.hostname)
  )
    throw new Error("Use HTTPS, or use HTTP with localhost or 127.0.0.1 for local testing.");
  return url.origin + url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
}

export function servicesPermission(base: string) {
  const { protocol, hostname } = new URL(base);
  return `${protocol}//${hostname}/*`;
}

export interface ConnectionStatus {
  base: string;
  playerId?: string;
  handle?: string;
  blocked?: boolean;
  expiresAt?: number;
}

export interface ServicesListing {
  id: string;
  startPrice: string;
  endsAt: string;
  finish: Finish;
}

export interface ServicesCard {
  id: string;
  name: string;
  rarity: string;
  families: { id: string; name: string }[];
  quests: string[];
  auctions: (AuctionPrice & { finish: Finish; endsAt: string })[];
  markets: Record<Finish, MarketHistory>;
}

export interface CardView {
  card?: ServicesCard;
  fetchedAt?: number;
  missing?: boolean;
  listings?: ServicesListing[];
  accessBlocked?: boolean;
  stale: boolean;
  until: number;
}

export function serviceFinish(value: unknown): Finish {
  if (value === "shiny") return "veil";
  if (value === "plain" || value === "fullart") return value;
  throw new Error("Invalid card finish.");
}

export function parseServicesCard(value: unknown, id: string): ServicesCard {
  const data = object(value),
    card = object(data.card);
  if (card.id !== id) throw new Error("Card ID mismatch.");
  const markets = {} as ServicesCard["markets"];
  for (const key of ["plain", "shiny", "fullart"] as const) {
    const finish = serviceFinish(key);
    const sale = object(object(data.sales)[key]);
    const aggregate = object(sale.last30Days);
    const last = sale.lastSale === null ? undefined : object(sale.lastSale);
    const daily = object(data.history)[key];
    if (!Array.isArray(daily)) throw new Error("Daily history unavailable.");
    markets[finish] = {
      finish,
      days: 30,
      count: count(aggregate.count),
      complete: false,
      sales: [],
      low: sale.low === null ? null : amount(sale.low),
      median: aggregate.median === null ? null : amount(aggregate.median),
      high: sale.high === null ? null : amount(sale.high),
      ...(last && {
        lastSale: {
          price: amount(last.price),
          soldAt: date(last.at),
          finish,
          numberOne: last.numberOne === true,
        },
      }),
      daily: daily.map((raw) => {
        const row = object(raw);
        if (typeof row.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.day))
          throw new Error("Invalid sales day.");
        return {
          day: row.day,
          count: count(row.count),
          low: amount(row.low),
          median: amount(row.median),
          high: amount(row.high),
        };
      }),
    };
  }
  if (
    !Array.isArray(card.families) ||
    !Array.isArray(card.quests) ||
    !Array.isArray(data.auctions)
  )
    throw new Error("Invalid card details.");
  return {
    id,
    name: text(card.name),
    rarity: text(card.rarity),
    families: card.families.map((raw) => {
      const family = object(raw);
      return { id: text(family.id), name: text(family.name) };
    }),
    quests: card.quests.map((raw) => text(object(raw).id)),
    auctions: data.auctions.map((raw) => {
      const row = object(raw);
      return {
        finish: serviceFinish(row.finish),
        price: amount(row.price),
        ...(typeof row.bids === "number" && Number.isSafeInteger(row.bids) && row.bids >= 0 && { bids: row.bids }),
        endsAt: date(row.endsAt),
      };
    }),
    markets,
  };
}

export function parseServicesListings(
  value: unknown,
  id: string,
): ServicesListing[] {
  if (!Array.isArray(value)) throw new Error("Open listings unavailable.");
  return value.map((raw) => {
    const row = object(raw);
    if (
      object(row.card).id !== id ||
      typeof row.id !== "string" ||
      !/^[0-9a-f]{24}$/.test(row.id)
    )
      throw new Error("Invalid listing.");
    return {
      id: row.id,
      finish: serviceFinish(row.finish),
      startPrice: amount(row.startPrice),
      endsAt: date(row.endsAt),
    };
  });
}
