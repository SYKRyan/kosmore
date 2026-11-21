import { FINISH_LABEL, type Finish } from "./types";
import type { HistoryState } from "./stat-catalog";
export function lastSaleSummary(
  histories: HistoryState,
  finishes: Finish[],
): { label: string; title: string } {
  if (!finishes.length)
    return {
      label: "Last Sale: —",
      title: "Select a variant to see its latest returned sale.",
    };
  if (finishes.some((finish) => !histories[finish]))
    return {
      label: "Last Sale: Loading…",
      title: "Loading completed sales for the selected variants.",
    };
  const partial = finishes.some(
    (finish) =>
      histories[finish] instanceof Error ||
      !(
        (histories[finish] as { complete: boolean; daily?: unknown })
          .complete || (histories[finish] as { daily?: unknown }).daily
      ),
  );
  const sales = finishes.flatMap((finish) => {
    const history = histories[finish];
    if (!history || history instanceof Error) return [];
    return history.lastSale ? [history.lastSale] : history.sales;
  });
  const latest = sales.sort(
    (a, b) => Date.parse(b.soldAt) - Date.parse(a.soldAt),
  )[0];
  if (!latest)
    return {
      label: partial ? "Last Sale: Unavailable" : "Last Sale: No sales",
      title:
        "No completed sale is available in the returned 30-day histories for the selected variants.",
    };
  const cents = (BigInt(latest.price) + 5000n) / 10000n;
  const price = `${(cents / 100n).toLocaleString("en-US")}.${String(cents % 100n).padStart(2, "0")}`;
  return {
    label: `Last Sale: $${price}${partial ? " (partial)" : ""}`,
    title: `${FINISH_LABEL[latest.finish]} · ${new Date(latest.soldAt).toLocaleString()} · Kosmo.${latest.numberOne ? " #1 copy." : ""} Most recent returned sale across selected variants.${partial ? " Some history is incomplete or unavailable." : ""}`,
  };
}
