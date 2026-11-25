import { FINISH_LABEL, type MarketHistory, type MarketSale } from "./types";

export function latestSale(history: MarketHistory) {
  return (
    history.lastSale ??
    history.sales.reduce<MarketSale | undefined>(
      (latest, sale) =>
        !latest || Date.parse(sale.soldAt) > Date.parse(latest.soldAt)
          ? sale
          : latest,
      undefined,
    )
  );
}

function badgePrice(amount: string) {
  const cents = (BigInt(amount) + 5000n) / 10000n;
  return `$${(cents / 100n).toLocaleString("en-US")}.${String(cents % 100n).padStart(2, "0")}`;
}

export function salePriceSummary(
  history: MarketHistory | Error | undefined,
  useMedian = false,
) {
  if (!history)
    return {
      title: "Loading completed sales for this finish.",
    };
  if (history instanceof Error)
    return { title: history.message };
  if (useMedian) {
    if (history.median == null)
      return { title: "No median sale price is available for this finish." };
    return {
      label: `Median: ${badgePrice(history.median)}`,
      title: `${FINISH_LABEL[history.finish]} · Median completed-sale price over the last ${history.days} days · Kosmo.`,
    };
  }
  const latest = latestSale(history);
  if (!latest)
    return { title: "No completed sale price is available for this finish." };
  const partial = !history.complete && !history.daily;
  return {
    numberOne: latest.numberOne,
    label: `Last Sale: ${badgePrice(latest.price)}${partial ? " (partial)" : ""}`,
    title: `${FINISH_LABEL[latest.finish]} · ${new Date(latest.soldAt).toLocaleString()} · Kosmo.${latest.numberOne ? " #1 copy." : ""}${partial ? " Some history is incomplete or unavailable." : ""}`,
  };
}
