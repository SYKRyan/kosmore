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
