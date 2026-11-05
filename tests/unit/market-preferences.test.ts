import { afterEach, it, expect, vi } from "vitest";
import {
  MARKET_FINISHES_KEY,
  parseMarketFinishes,
  readMarketFinishes,
  saveMarketFinishes,
} from "../../src/shared/market-preferences";
afterEach(() => vi.unstubAllGlobals());
it("defaults to all variants while preserving a deliberate empty selection", () => {
  expect(parseMarketFinishes(undefined)).toEqual(["plain", "veil", "fullart"]);
  expect(parseMarketFinishes([])).toEqual([]);
  expect(parseMarketFinishes(["veil", "plain", "plain", "unknown"])).toEqual([
    "plain",
    "veil",
  ]);
  expect(parseMarketFinishes(["unknown"])).toEqual([
    "plain",
    "veil",
    "fullart",
  ]);
});
it("persists rapid filter changes in order without touching options-page settings", async () => {
  const store: Record<string, unknown> = {
    "kosmore.settings": { enabled: false },
  };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => ({ ...store }),
        set: async (update: Record<string, unknown>) => {
          Object.assign(store, update);
        },
      },
    },
  });
  await Promise.all([
    saveMarketFinishes(["plain"]),
    saveMarketFinishes(["veil"]),
    saveMarketFinishes([]),
  ]);
  expect(await readMarketFinishes()).toEqual([]);
  expect(store[MARKET_FINISHES_KEY]).toEqual([]);
  expect(store["kosmore.settings"]).toEqual({ enabled: false });
});
