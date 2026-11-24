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

export function lastSaleSummary(history: MarketHistory | Error | undefined) {
  if (!history)
    return {
      title: "Loading completed sales for this finish.",
    };
  if (history instanceof Error)
    return { title: history.message };
  const latest = latestSale(history);
  const partial = !history.complete && !history.daily;
  if (!latest)
    return {
      title: "No completed sale price is available for this finish.",
    };
  const cents = (BigInt(latest.price) + 5000n) / 10000n;
  const price = `${(cents / 100n).toLocaleString("en-US")}.${String(cents % 100n).padStart(2, "0")}`;
  return {
    numberOne: latest.numberOne,
    label: `Last Sale: $${price}${partial ? " (partial)" : ""}`,
    title: `${FINISH_LABEL[latest.finish]} · ${new Date(latest.soldAt).toLocaleString()} · Kosmo.${latest.numberOne ? " #1 copy." : ""}${partial ? " Some history is incomplete or unavailable." : ""}`,
  };
}
