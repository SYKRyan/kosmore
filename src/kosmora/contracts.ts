import type {
  Account,
  Album,
  CardInsights,
  Finish,
  MarketHistory,
  OpeningCard,
  Variant,
} from "../shared/types";
import { parseCardFamilies } from "./friends";
type Obj = Record<string, unknown>;
export function object(v: unknown): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Kosmora returned an unfamiliar response.");
  return v as Obj;
}
export function text(v: unknown): string {
  if (typeof v !== "string")
    throw new Error("Kosmora returned an unfamiliar text value.");
  return v;
}
export function count(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
    throw new Error("Kosmora returned an unfamiliar count.");
  return v;
}
export function subjectId(v: unknown): string {
  const s = text(v);
  if (!/^\d{1,18}$/.test(s)) throw new Error("Invalid card identifier.");
  return BigInt(s).toString();
}
export function uuid(v: unknown): string {
  const s = text(v);
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s))
    throw new Error("Invalid copy or album identifier.");
  return s;
}
export function amount(v: unknown): string {
  const s = text(v);
  if (!/^\d+$/.test(s)) throw new Error("Invalid market price.");
  return s;
}
export function date(v: unknown): string {
  const s = text(v);
  if (!Number.isFinite(Date.parse(s))) throw new Error("Invalid sale date.");
  return s;
}
export function variantOf(v: Obj): Variant {
  return { veil: v.veil === true, fullArt: !!v.fullArt };
}
export function parseAccount(v: unknown): Account {
  const d = object(v),
    handle = text(d.handle);
  if (!/^[A-Za-z0-9_]{1,24}$/.test(handle))
    throw new Error("Sign in to Kosmora to use card insights.");
  const opening = d.currentOpening ? object(d.currentOpening) : undefined;
  return {
    key: handle.toLowerCase(),
    handle,
    ...(opening ? { currentOpeningId: uuid(opening.id) } : {}),
  };
}
export function parseInsights(v: unknown): CardInsights {
  const d = object(v),
    id = subjectId(d.subjectId),
    interest = d.interest ? object(d.interest) : undefined,
    pop = d.popularity ? object(d.popularity) : undefined;
  if (!Array.isArray(d.copies))
    throw new Error("Owned copies are unavailable.");
  let families: CardInsights["families"] = null;
  try {
    families = parseCardFamilies(d.families);
  } catch {
    /* Isolate family failures from market and album features. */
  }
  return {
    subjectId: id,
    name: text(d.name),
    rarity: text(d.rarity),
    families,
    interested:
      interest && typeof interest.count === "number"
        ? count(interest.count)
        : null,
    readership:
      pop &&
      typeof pop.medianDailyViews === "number" &&
      Number.isFinite(pop.medianDailyViews) &&
      pop.medianDailyViews >= 0
        ? pop.medianDailyViews
        : null,
    readershipSource:
      pop && typeof pop.source === "string" ? pop.source : undefined,
    copies: d.copies.map((v) => {
      const c = object(v);
      return {
        id: uuid(c.id),
        subjectId: id,
        state: text(c.state),
        auctionId: c.auction_id == null ? undefined : uuid(c.auction_id),
        variant: variantOf(c),
        serial: typeof c.serial === "number" ? c.serial : undefined,
        acquiredAt:
          typeof c.acquired_at === "string" ? c.acquired_at : undefined,
      };
    }),
  };
}
export function parseHistory(v: unknown, finish: Finish): MarketHistory {
  const p = object(object(v).prices),
    n = count(p.count);
  if (p.days !== 30)
    throw new Error(
      "The market reporting window changed. History is unavailable until the integration is updated.",
    );
  if (!Array.isArray(p.sales))
    throw new Error("Market history is unavailable.");
  const sales = p.sales.map((v) => {
    const s = object(v);
    return {
      auctionId: uuid(s.auctionId),
      price: amount(s.price),
      soldAt: date(s.soldAt),
      finish,
    };
  });
  return {
    finish,
    count: n,
    days: count(p.days),
    median: n ? amount(p.median) : null,
    low: n ? amount(p.low) : null,
    high: n ? amount(p.high) : null,
    sales,
    complete: sales.length === n,
  };
}
export function parseAlbums(v: unknown): Album[] {
  const d = object(v);
  if (!Array.isArray(d.albums)) throw new Error("Album list is unavailable.");
  return d.albums.map((v) => {
    const a = object(v);
    return {
      id: uuid(a.id),
      name: text(a.name),
      items: count(a.items),
      contains: typeof a.contains === "boolean" ? a.contains : undefined,
      containsCount:
        typeof a.containsCount === "number"
          ? count(a.containsCount)
          : undefined,
    };
  });
}
export function parseReadyPackIds(value: unknown): string[] {
  const { packs } = object(value);
  if (!Array.isArray(packs))
    throw new Error("Kosmora returned an unfamiliar pack inventory.");
  return [
    ...new Set(
      packs.flatMap((value) => {
        const pack = object(value);
        return pack.status === "ready" && pack.openingId
          ? [uuid(pack.openingId).toLowerCase()]
          : [];
      }),
    ),
  ];
}

export function parseOpening(v: unknown): OpeningCard[] {
  const d = object(v),
    id = uuid(d.id);
  if (!Array.isArray(d.cards)) return [];
  return d.cards.map((v) => {
    const c = object(v),
      face = c.card ? object(c.card) : {};
    return {
      openingId: id,
      slot: count(c.slot),
      subjectId: subjectId(c.subjectId),
      instanceId: uuid(c.instanceId),
      rarity: text(c.rarity),
      variant: { veil: c.veil === true, fullArt: !!face.fullArt },
    };
  });
}
// Prices are integer millionths of a Kosmo. Never divide them using floating point for display.
export function formatKosmo(value: string): string {
  const n = BigInt(amount(value)),
    whole = n / 1_000_000n,
    fraction = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return whole.toLocaleString("en-US") + (fraction ? "." + fraction : "");
}
