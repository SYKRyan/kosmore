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
it("uses newest date rather than highest price and respects selected variants", () => {
  const histories = {
    plain: history("plain", "99000000", "2026-11-01T00:00:00Z"),
    veil: history("veil", "12345000", "2026-11-02T00:00:00Z"),
  };
  expect(lastSaleSummary(histories, ["plain", "veil"]).label).toBe(
    "Last Sold: $12.35",
  );
  expect(lastSaleSummary(histories, ["plain"]).label).toBe("Last Sold: $99.00");
  expect(
    lastSaleSummary({ plain: history("plain", "0", "2026-11-01T00:00:00Z") }, [
      "plain",
    ]).label,
  ).toBe("Last Sold: $0.00");
});
it("distinguishes pending, no sales, failed and partial histories", () => {
  expect(lastSaleSummary({}, []).label).toBe("Last Sold: —");
  expect(lastSaleSummary({}, ["plain"]).label).toBe("Last Sold: Loading…");
  const empty = {
    ...history("plain", "0", "2026-11-01T00:00:00Z"),
    sales: [],
    count: 0,
  };
  expect(lastSaleSummary({ plain: empty }, ["plain"]).label).toBe(
    "Last Sold: No sales",
  );
  expect(
    lastSaleSummary({ plain: new Error("unavailable") }, ["plain"]).label,
  ).toBe("Last Sold: Unavailable");
  expect(
    lastSaleSummary(
      {
        plain: history("plain", "1234567890", "2026-11-01T00:00:00Z"),
        veil: new Error("unavailable"),
      },
      ["plain", "veil"],
    ).label,
  ).toBe("Last Sold: $1,234.57 (partial)");
});
