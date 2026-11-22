import { describe, it, expect } from "vitest";
import {
  dailySalePrices,
  summarizePrices,
} from "../../src/shared/market-summary";
import type { Finish, MarketHistory } from "../../src/shared/types";

function history(finish: Finish, values: string[]): MarketHistory {
  return {
    finish,
    days: 30,
    count: values.length,
    low: values[0] ?? null,
    median: values[Math.floor(values.length / 2)] ?? null,
    high: values.at(-1) ?? null,
    complete: true,
    sales: values.map((price, i) => ({
      price,
      finish,
      soldAt: "2026-11-04T12:00:00Z",
      auctionId: String(i),
    })),
  };
}
it("groups individual sales by UTC day and preserves an exact even-count median", () => {
  const h = history("plain", ["1000001", "1000000", "0"]);
  h.sales[2].soldAt = "2026-11-04T23:30:00-05:00";
  expect(dailySalePrices(h)).toEqual([
    {
      day: "2026-11-04",
      finish: "plain",
      min: "1",
      median: "1.0000005",
      max: "1.000001",
    },
    { day: "2026-11-05", finish: "plain", min: "0", median: "0", max: "0" },
  ]);
});

describe("selected-variant price boxes", () => {
  it("computes a combined median from transactions, not variant medians", () => {
    expect(
      summarizePrices([
        history("plain", ["1000000", "2000000", "100000000"]),
        history("veil", ["200000000"]),
      ]),
    ).toEqual({ min: "1", median: "51", max: "200", sampled: false });
  });
  it("uses authoritative summary prices when a single finish has truncated history", () => {
    const h = {
      ...history("plain", ["12000000"]),
      count: 100,
      low: "1000000",
      median: "50000000",
      high: "1000000000",
      complete: false,
    };
    expect(summarizePrices([h])).toEqual({
      min: "1",
      median: "50",
      max: "1,000",
      sampled: false,
    });
  });
  it("labels combined sample statistics and does not claim full-history extrema", () => {
    const a = {
      ...history("plain", ["12000000"]),
      count: 100,
      low: "1000000",
      high: "1000000000",
      complete: false,
    };
    expect(summarizePrices([a, history("veil", ["24000000"])])).toEqual({
      min: "12",
      median: "18",
      max: "24",
      sampled: true,
    });
  });
  it("preserves half-micro medians exactly and handles zero prices", () => {
    expect(
      summarizePrices([
        history("plain", ["1000000"]),
        history("veil", ["1000001"]),
      ]).median,
    ).toBe("1.0000005");
    expect(summarizePrices([history("plain", ["0"])]).min).toBe("0");
  });
  it("leaves prices unavailable with no selected histories or no sales", () => {
    expect(summarizePrices([])).toEqual({
      min: null,
      median: null,
      max: null,
      sampled: false,
    });
    expect(
      summarizePrices([history("plain", []), history("veil", [])]),
    ).toEqual({ min: null, median: null, max: null, sampled: false });
  });
});
