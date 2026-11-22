import type { MarketHistory } from "./types";
import { formatKosmo } from "../kosmora/contracts";

export interface PriceSummary {
  min: string | null;
  median: string | null;
  max: string | null;
  sampled: boolean;
}

function medianPrice(sorted: bigint[]): string {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return formatKosmo(sorted[middle].toString());
  // A midpoint can be half a micro-Kosmo. Preserve that seventh decimal exactly.
  const tenths = (sorted[middle - 1] + sorted[middle]) * 5n;
  const fraction = (tenths % 10_000_000n)
    .toString()
    .padStart(7, "0")
    .replace(/0+$/, "");
  return (
    (tenths / 10_000_000n).toLocaleString("en-US") +
    (fraction ? `.${fraction}` : "")
  );
}

/** Round the arithmetic mean to the nearest micro-Kosmo. */
function meanPrice(sum: bigint, count: number) {
  const n = BigInt(count);
  return formatKosmo(((sum + n / 2n) / n).toString());
}

export function dailySalePrices(history: MarketHistory) {
  const days = new Map<string, bigint[]>();
  const seen = new Set<string>();
  for (const sale of history.sales) {
    if (seen.has(sale.auctionId) || (history.daily?.length && sale.numberOne))
      continue;
    seen.add(sale.auctionId);
    const day = new Date(sale.soldAt).toISOString().slice(0, 10);
    const prices = days.get(day) ?? [];
    prices.push(BigInt(sale.price));
    days.set(day, prices);
  }
  const mean = (prices: bigint[]) =>
    meanPrice(
      prices.reduce((a, b) => a + b, 0n),
      prices.length,
    );
  if (history.daily?.length)
    return history.daily
      .filter((row) => row.count > 0)
      .map((row) => {
        const prices = days.get(row.day);
        const low = BigInt(row.low),
          high = BigInt(row.high),
          median = BigInt(row.median);
        let average: string | undefined;
        if (row.count === 1 || low === high) average = formatKosmo(row.median);
        else if (row.count === 2) average = meanPrice(low + high, 2);
        else if (row.count === 3) average = meanPrice(low + median + high, 3);
        else if (
          prices?.length === row.count &&
          prices.every((price) => price >= low && price <= high)
        )
          average = mean(prices);
        return {
          day: row.day,
          count: row.count,
          finish: history.finish,
          average,
          min: formatKosmo(row.low),
          median: formatKosmo(row.median),
          max: formatKosmo(row.high),
        };
      });
  return Array.from(days, ([day, prices]) => {
    prices.sort((a, b) => (a < b ? -1 : +(a > b)));
    return {
      day,
      finish: history.finish,
      count: prices.length,
      average: mean(prices),
      min: formatKosmo(prices[0].toString()),
      median: medianPrice(prices),
      max: formatKosmo(prices.at(-1)!.toString()),
    };
  });
}

export type DailySalePrice = ReturnType<typeof dailySalePrices>[number];

export function summarizePrices(histories: MarketHistory[]): PriceSummary {
  if (histories.length === 1) {
    const h = histories[0];
    return {
      min: h.low === null ? null : formatKosmo(h.low),
      median: h.median === null ? null : formatKosmo(h.median),
      max: h.high === null ? null : formatKosmo(h.high),
      sampled: false,
    };
  }
  if (histories.some((history) => history.daily)) {
    const range = (key: "low" | "high") => {
      const prices = histories.flatMap((history) =>
        history[key] === null ? [] : [BigInt(history[key])],
      );
      if (!prices.length) return null;
      const extreme = prices.reduce((a, b) =>
        (key === "low" ? a < b : a > b) ? a : b,
      );
      return formatKosmo(extreme.toString());
    };
    const active = histories.filter((h) => h.count > 0);
    return {
      min: range("low"),
      max: range("high"),
      median:
        active.length === 1 && active[0].median !== null
          ? formatKosmo(active[0].median)
          : null,
      sampled: false,
    };
  }
  const prices = histories
    .flatMap((h) => h.sales.map((s) => BigInt(s.price)))
    .sort((a, b) => (a < b ? -1 : +(a > b)));
  const sampled = histories.some((h) => !h.complete);
  if (!prices.length) return { min: null, median: null, max: null, sampled };
  return {
    min: formatKosmo(prices[0].toString()),
    median: medianPrice(prices),
    max: formatKosmo(prices.at(-1)!.toString()),
    sampled,
  };
}
