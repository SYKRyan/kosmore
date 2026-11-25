import { expect, it } from "vitest";
import { salePriceSummary } from "../../src/shared/last-sale";
import type { Finish, MarketHistory } from "../../src/shared/types";
const history = (
  finish: Finish,
  price: string,
  soldAt: string,
): MarketHistory => ({
  finish,
  days: 30,
  count: 1,
  low: price,
  median: price,
  high: price,
  complete: true,
  sales: [{ finish, auctionId: "auction", price, soldAt }],
});
it("uses the newest sale in the displayed history, including a zero price", () => {
  const h = history("veil", "12345000", "2026-11-02T00:00:00Z");
  h.sales.push({
    ...h.sales[0],
    price: "99000000",
    soldAt: "2026-11-01T00:00:00Z",
  });
  expect(salePriceSummary(h).label).toBe("Last Sale: $12.35");
  expect(salePriceSummary(h).title).toContain("Shiny");
  h.lastSale = { finish: "veil", price: "0", soldAt: "2026-11-03T00:00:00Z" };
  expect(salePriceSummary(h).label).toBe("Last Sale: $0.00");
});
it("distinguishes pending, no sales, failed and partial histories", () => {
  expect(salePriceSummary(undefined)).toEqual({ title: "Loading completed sales for this finish." });
  const h = history("plain", "1234567890", "2026-11-01T00:00:00Z");
  expect(salePriceSummary({ ...h, sales: [], count: 0 })).toEqual({
    title: "No completed sale price is available for this finish.",
  });
  expect(salePriceSummary(new Error("unavailable"))).toEqual({ title: "unavailable" });
  expect(salePriceSummary({ ...h, complete: false }).label).toBe(
    "Last Sale: $1,234.57 (partial)",
  );
});
it("uses the finish aggregate even when individual sale records are unavailable", () => {
  const h = history("veil", "123456000", "2026-11-01T00:00:00Z");
  expect(salePriceSummary({ ...h, sales: [] }, true).label).toBe("Median: $123.46");
  expect(salePriceSummary({ ...h, median: null }, true).label).toBeUndefined();
  expect(salePriceSummary({ ...h, median: "0" }, true).label).toBe("Median: $0.00");
});
