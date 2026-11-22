import { expect, it } from "vitest";
import { lastSaleSummary } from "../../src/shared/last-sale";
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
  expect(lastSaleSummary(h).label).toBe("Last Sale: $12.35");
  expect(lastSaleSummary(h).title).toContain("Shiny");
  h.lastSale = { finish: "veil", price: "0", soldAt: "2026-11-03T00:00:00Z" };
  expect(lastSaleSummary(h).label).toBe("Last Sale: $0.00");
});
it("distinguishes pending, no sales, failed and partial histories", () => {
  expect(lastSaleSummary(undefined).label).toBe("Last Sale: Loading…");
  const h = history("plain", "1234567890", "2026-11-01T00:00:00Z");
  expect(lastSaleSummary({ ...h, sales: [], count: 0 }).label).toBe(
    "Last Sale: No sales",
  );
  expect(lastSaleSummary(new Error("unavailable")).label).toBe(
    "Last Sale: Unavailable",
  );
  expect(lastSaleSummary({ ...h, complete: false }).label).toBe(
    "Last Sale: $1,234.57 (partial)",
  );
});
