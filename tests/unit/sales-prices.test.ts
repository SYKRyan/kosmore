import { expect, it } from "vitest";
import {
  adjustedSalePrice,
  belowSaleMinimum,
  discountedSalePrice,
  quickSalePrice,
  validSaleAdjustment,
} from "../../src/shared/sales-prices";
import { parseSettings } from "../../src/shared/settings";

it("adds positive and negative Kosmo adjustments exactly, including fractional and large values", () => {
  expect(adjustedSalePrice("12000000", -1)).toBe("11");
  expect(adjustedSalePrice("12000000", 2)).toBe("14");
  expect(adjustedSalePrice("1000001", -0.000001)).toBe("1");
  expect(adjustedSalePrice("1010000", 0.1)).toBe("1.11");
  expect(adjustedSalePrice("9007199254740993123456", 0)).toBe(
    "9007199254740993.123456",
  );
  expect(adjustedSalePrice("1", 9000000000.123455)).toBe("9000000000.123456");
});
it("rejects invalid adjustments and floors low results at the game's rarity minimum", () => {
  for (const value of [NaN, Infinity, "-1", null, 0.0000001, 1e12])
    expect(validSaleAdjustment(value)).toBe(false);
  expect(adjustedSalePrice("1000000", -1)).toBe("1");
  expect(adjustedSalePrice("21000000", -2, 20)).toBe("20");
  expect(() => adjustedSalePrice("invalid", 0)).toThrow();
});
it("rounds the percent reduction before subtracting and applies only the game minimum", () => {
  expect(discountedSalePrice("102500000", 25, "percent", 1)).toBe("76.5");
  expect(discountedSalePrice("102500000", 25, "flat", 1)).toBe("77.5");
  expect(discountedSalePrice("520000000", 120, "percent", 500)).toBe("500");
  expect(quickSalePrice(2.25, 20)).toBe("20");
  expect(quickSalePrice(20.25, 20)).toBe("20.25");
  expect(belowSaleMinimum("20.25", 20.5)).toBe(true);
  expect(belowSaleMinimum("20.50", 20.5)).toBe(false);
});
it("defaults shared sales badges and click behavior on with zero adjustments and keeps independent choices", () => {
  const old = parseSettings({ schemaVersion: 1 });
  expect(old.salesOverlaysEnabled).toBe(true);
  expect(old.showSalesLastSale).toBe(true);
  expect(old.showSalesLowestListing).toBe(true);
  expect(old.salesLastSaleSetsPrice).toBe(true);
  expect(old.salesLowestListingSetsPrice).toBe(true);
  expect(old.salesLastSaleAdjustment).toBe(0);
  expect(old.salesLowestListingAdjustment).toBe(0);
  expect(old.showSalesMyLastListing).toBe(true);
  expect(old.salesMyLastListingSetsPrice).toBe(true);
  expect(old.salesMyLastListingAdjustment).toBe(0);
  const saved = parseSettings({
    ...old,
    salesOverlaysEnabled: false,
    showSalesLastSale: false,
    salesLastSaleSetsPrice: false,
    salesLastSaleAdjustment: -1,
    salesLowestListingAdjustment: 0.25,
    salesMyLastListingAdjustment: -0.123456,
  });
  expect(saved.salesLastSaleAdjustment).toBe(-1);
  expect(saved.salesLowestListingAdjustment).toBe(0.25);
  expect(saved.salesMyLastListingAdjustment).toBe(-0.123456);
  expect(saved.salesLastSaleSetsPrice).toBe(false);
  expect(saved.showSalesLastSale).toBe(false);
  expect(saved.showSalesLowestListing).toBe(true);
  expect(
    parseSettings({
      ...old,
      salesLastSaleAdjustment: "-1",
      salesLowestListingAdjustment: NaN,
    }).salesLastSaleAdjustment,
  ).toBe(0);
});
