import {
  FINISHES,
  type CardInsights,
  type Finish,
  type MarketHistory,
} from "./types";
import { summarizePrices, type PriceSummary } from "./market-summary";

export type HistoryState = Partial<Record<Finish, MarketHistory | Error>>;
export interface StatSnapshot {
  card?: CardInsights;
  prices: PriceSummary;
  saleCount: number | null;
  complete: boolean;
  priceNotice: string;
  cardError?: string;
  activeAuctions?: number | Error;
}
export interface StatValue {
  value: string;
  title?: string;
}
interface StatDefinition {
  id: string;
  label: string;
  description: string;
  source: "prices" | "card" | "sales" | "auctions";
  preview: StatValue;
  read: (snapshot: StatSnapshot) => StatValue;
}
// One entry supplies both settings and popup behavior. IDs are persisted; keep them stable.
export const STAT_CATALOG = [
  {
    id: "minPrice",
    label: "Min Price",
    description: "Lowest completed-sale price for the selected variants.",
    source: "prices",
    preview: { value: "12" },
    read: (s: StatSnapshot) => ({
      value: s.prices.min ?? "—",
      title: s.priceNotice,
    }),
  },
  {
    id: "medianPrice",
    label: "Median Price",
    description: "Median completed-sale price for the selected variants.",
    source: "prices",
    preview: { value: "18" },
    read: (s: StatSnapshot) => ({
      value: s.prices.median ?? "—",
      title: s.priceNotice,
    }),
  },
  {
    id: "maxPrice",
    label: "Max Price",
    description: "Highest completed-sale price for the selected variants.",
    source: "prices",
    preview: { value: "24" },
    read: (s: StatSnapshot) => ({
      value: s.prices.max ?? "—",
      title: s.priceNotice,
    }),
  },
  {
    id: "interest",
    label: "Kosmora interest",
    description: "Number of players interested in the card.",
    source: "card",
    preview: { value: "18" },
    read: (s: StatSnapshot) => ({
      value: s.card?.interested?.toLocaleString() ?? "—",
      title: s.cardError ?? "Players interested in this card",
    }),
  },
  {
    id: "readership",
    label: "Wikipedia · recorded median/day",
    description: "Kosmora’s recorded median daily Wikipedia views.",
    source: "card",
    preview: { value: "1,240" },
    read: (s: StatSnapshot) => ({
      value: s.card?.readership?.toLocaleString() ?? "—",
      title:
        s.cardError ??
        `Kosmora’s recorded median daily Wikipedia views. ${s.card?.readershipSource ?? ""}`,
    }),
  },
  {
    id: "salesCount",
    label: "Sales · 30 days",
    description: "Completed-sale count across the selected variants.",
    source: "sales",
    preview: { value: "9" },
    read: (s: StatSnapshot) => ({
      value:
        s.saleCount === null
          ? "—"
          : `${s.saleCount.toLocaleString()}${s.complete ? "" : "+"}`,
      title: s.complete
        ? "Completed sales across the selected market finish groups."
        : "Incomplete while one or more finish groups are unavailable.",
    }),
  },
  {
    id: "activeAuctions",
    label: "Active Auctions",
    description:
      "Open, unexpired market listings for this card across all finishes.",
    source: "auctions",
    preview: { value: "7" },
    read: (s: StatSnapshot) => ({
      value:
        typeof s.activeAuctions === "number"
          ? s.activeAuctions.toLocaleString()
          : "—",
      title:
        s.activeAuctions instanceof Error
          ? s.activeAuctions.message
          : typeof s.activeAuctions === "number"
            ? "Active listings for this exact card across all finishes. Counts are cached for up to 30 seconds; Refresh checks again."
            : (s.cardError ?? "Loading active auctions…"),
    }),
  },
] as const satisfies readonly StatDefinition[];
export type StatId = (typeof STAT_CATALOG)[number]["id"];
export interface StatPreference {
  id: StatId;
  enabled: boolean;
}
export const defaultStats = (): StatPreference[] =>
  STAT_CATALOG.map(({ id }) => ({ id, enabled: true }));
export function parseStats(value: unknown): StatPreference[] {
  if (!Array.isArray(value)) return defaultStats();
  const known = new Map(STAT_CATALOG.map((d) => [d.id, d]));
  const seen = new Set<StatId>();
  const result: StatPreference[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { id, enabled } = entry as Partial<StatPreference>;
    if (!id || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, enabled: typeof enabled === "boolean" ? enabled : true });
  }
  // New catalog entries appear automatically without resetting existing choices or ordering.
  return [...result, ...defaultStats().filter((p) => !seen.has(p.id))];
}
export function visibleStats(preferences: StatPreference[]) {
  return preferences
    .filter((p) => p.enabled)
    .map((p) => STAT_CATALOG.find((d) => d.id === p.id)!);
}
export function statSnapshot(
  card: CardInsights | undefined,
  histories: HistoryState,
  finishes: Finish[],
  cardError?: string,
  activeAuctions?: number | Error,
): StatSnapshot {
  const selected = FINISHES.filter((f) => finishes.includes(f));
  const known = selected.flatMap((f) => {
    const h = histories[f];
    return h && !(h instanceof Error) ? [h] : [];
  });
  const complete = known.length === selected.length;
  const prices = summarizePrices(known);
  let priceNotice = !selected.length
    ? "Select a variant to see prices."
    : prices.sampled
      ? "Prices based on the returned sales sample."
      : "";
  if (selected.length && !complete)
    priceNotice += `${priceNotice ? " " : ""}Some selected variants are loading or unavailable.`;
  return {
    card,
    prices,
    saleCount: known.length ? known.reduce((n, h) => n + h.count, 0) : null,
    complete,
    priceNotice,
    cardError,
    activeAuctions,
  };
}
