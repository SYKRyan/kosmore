import { describe, it, expect } from "vitest";
import {
  parseAlbums,
  parseHistory,
  parseInsights,
  formatKosmo,
  parseOpening,
} from "../../src/kosmora/contracts";
import { albums, card, opening, prices } from "../fixtures/data";
describe("observed game contracts", () => {
  it("preserves auction identifiers only on the signed-in account's listed copies", () => {
    const listed = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const source = card();
    const copies = [
      { ...source.copies[0], state: "escrow", auction_id: listed },
      { ...source.copies[0], auction_id: null },
      source.copies[0],
    ];
    expect(
      parseInsights({ ...source, copies }).copies.map((c) => c.auctionId),
    ).toEqual([listed, undefined, undefined]);
    expect(() =>
      parseInsights({
        ...source,
        copies: [{ ...source.copies[0], auction_id: "unverified" }],
      }),
    ).toThrow();
  });
  it("preserves fractional recorded medians and rejects a changed reporting window", () => {
    const d = card();
    d.popularity.medianDailyViews = 20.5;
    expect(parseInsights(d).readership).toBe(20.5);
    const p = prices();
    p.prices.days = 60;
    expect(() => parseHistory(p, "plain")).toThrow("reporting window");
  });
  it("formats micro-Kosmo exactly, including values beyond floating point precision", () => {
    expect(formatKosmo("100000000")).toBe("100");
    expect(formatKosmo("12000001")).toBe("12.000001");
    expect(formatKosmo("9007199254740993123456")).toBe(
      "9,007,199,254,740,993.123456",
    );
  });
  it("separates interest and recorded Wikipedia readership", () => {
    const d = parseInsights(card());
    expect(d.interested).toBe(18);
    expect(d.readership).toBe(1240);
  });
  it("preserves server totals when only a sample is returned", () => {
    const d = prices();
    d.prices.count = 50;
    const h = parseHistory(d, "veil");
    expect(h.complete).toBe(false);
    expect(h.count).toBe(50);
    expect(h.sales[0].finish).toBe("veil");
  });
  it("distinguishes an empty history from a malformed response", () => {
    expect(parseHistory(prices(0), "plain").count).toBe(0);
    expect(() =>
      parseHistory({ prices: { count: 3, days: 30, sales: [{}] } }, "plain"),
    ).toThrow();
  });
  it("preserves explicit add membership flags and opening slot identities", () => {
    expect(parseAlbums(albums(true))[0].contains).toBe(true);
    expect(parseOpening(opening)[1].slot).toBe(1);
    expect(parseOpening(opening)[0].instanceId).not.toBe(
      parseOpening(opening)[1].instanceId,
    );
  });
});
