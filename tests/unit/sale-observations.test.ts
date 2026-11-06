import { expect, it, vi } from "vitest";
import {
  combinedRate,
  finishOf,
  bucketKey,
  parseObservations,
  pruneObservations,
  recordObservation,
  resolveWithHistory,
  saleRates,
  serializeObservations,
  type Observation,
  type Observations,
} from "../../src/shared/sale-observations";
import { SaleObservationStore } from "../../src/content/sale-observation-store";
import type { Finish, MarketHistory } from "../../src/shared/types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-05T12:00:00Z");
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const obs = (
  outcome: Observation["outcome"],
  daysAgo = 1,
  finish: Finish = "plain",
  subjectId = "42",
): Observation => ({
  subjectId,
  finish,
  outcome,
  endsAt: NOW - daysAgo * DAY,
});
const log = (...entries: Observation[]): Observations =>
  new Map(entries.map((o, i) => [id(i + 1), o]));
const history = (
  finish: Finish,
  auctionIds: string[] = [],
  complete = true,
): MarketHistory => ({
  finish,
  days: 30,
  count: auctionIds.length,
  low: null,
  median: null,
  high: null,
  sales: auctionIds.map((auctionId) => ({
    auctionId,
    price: "1000000",
    soldAt: new Date(NOW).toISOString(),
    finish,
  })),
  complete,
});

it("round-trips the compact stored form and drops malformed or older-format entries", () => {
  const observations = log(obs("sold"), obs("unsold", 2, "veil", "7"));
  expect(parseObservations(serializeObservations(observations))).toEqual(
    observations,
  );
  expect(
    parseObservations({
      v: 2,
      a: {
        [id(1)]: ["42", "fullart", 1, NOW],
        "not-an-id": ["42", "plain", 1, NOW],
        [id(2)]: ["4x2", "plain", 1, NOW],
        [id(3)]: ["42", "gold", 1, NOW],
        [id(4)]: ["42", "plain", 9, NOW],
        [id(5)]: ["42", "plain", 1, "soon"],
        [id(6)]: ["42", "plain", 1],
      },
    }),
  ).toEqual(
    new Map([
      [
        id(1),
        { subjectId: "42", finish: "fullart", outcome: "sold", endsAt: NOW },
      ],
    ]),
  );
  for (const bad of [undefined, null, "x", { v: 1, a: {} }, { v: 2 }])
    expect(parseObservations(bad).size).toBe(0);
});

it("classifies finishes like the native market: full art wins over shiny", () => {
  expect(finishOf({})).toBe("plain");
  expect(finishOf({ veil: true })).toBe("veil");
  expect(finishOf({ veil: "yes" })).toBe("plain");
  expect(finishOf({ veil: true, fullArt: true })).toBe("fullart");
  expect(finishOf({ fullArt: { id: 1 } })).toBe("fullart");
});

it("never downgrades a resolved listing back to open", () => {
  const observations: Observations = new Map();
  expect(recordObservation(observations, id(1), obs("sold", 1))).toBe(true);
  expect(recordObservation(observations, id(1), obs("open", -1))).toBe(false);
  expect(observations.get(id(1))).toEqual(obs("sold", 1));
  expect(recordObservation(observations, id(1), obs("sold", 1))).toBe(false);
  expect(recordObservation(observations, "bad", obs("sold"))).toBe(false);
  expect(
    recordObservation(observations, id(2), { ...obs("open"), endsAt: NaN }),
  ).toBe(false);
});

it("prunes listings older than 35 days and caps the log size, reporting touched days", () => {
  const observations = log(obs("sold", 1), obs("sold", 36));
  expect(pruneObservations(observations, NOW)).toEqual(
    new Set([bucketKey(NOW - 36 * DAY)]),
  );
  expect([...observations.keys()]).toEqual([id(1)]);
  const big: Observations = new Map();
  for (let i = 0; i < 20_005; i++)
    big.set(id(i), { ...obs("sold"), endsAt: NOW - i });
  pruneObservations(big, NOW);
  expect(big.size).toBe(20_000);
  expect(big.has(id(0))).toBe(true);
  expect(big.has(id(20_004))).toBe(false);
});

it("settles a listing only from conclusive evidence for its own finish", () => {
  const observations = log(
    obs("open", 1, "plain"),
    obs("open", 1, "veil"),
    obs("open", 1, "plain"),
    { ...obs("open", 0, "plain"), endsAt: NOW - 60_000 },
    obs("open", 1, "plain", "99"),
  );
  const fetched = NOW;
  // A sale proves itself from any finish's history (auction IDs are unique).
  expect(
    resolveWithHistory(
      observations,
      "42",
      history("fullart", [id(1)], false),
      fetched,
    ),
  ).toEqual([id(1)]);
  // A complete Standard history cannot settle a Shiny listing as unsold.
  expect(
    resolveWithHistory(observations, "42", history("plain"), fetched),
  ).toEqual([id(3)]);
  expect(observations.get(id(2))!.outcome).toBe("open");
  expect(observations.get(id(3))!.outcome).toBe("unsold");
  // Just ended (inside the 10-minute margin) and other cards stay open.
  expect(observations.get(id(4))!.outcome).toBe("open");
  expect(observations.get(id(5))!.outcome).toBe("open");
  // An incomplete Shiny history cannot prove "no sale"; a complete one can.
  expect(
    resolveWithHistory(observations, "42", history("veil", [], false), fetched),
  ).toEqual([]);
  expect(
    resolveWithHistory(observations, "42", history("veil"), fetched),
  ).toEqual([id(2)]);
  // A history fetched before the listing ended proves nothing.
  const late = log(obs("open", 0.001, "plain"));
  expect(resolveWithHistory(late, "42", history("plain"), NOW - DAY)).toEqual(
    [],
  );
});

it("reports each card's own rate per finish over 30 days, ignoring other cards", () => {
  const observations = log(
    obs("sold", 1, "plain"),
    obs("unsold", 2, "plain"),
    obs("sold", 29, "plain"),
    obs("sold", 31, "plain"),
    obs("unsold", 3, "veil"),
    obs("open", 1, "veil"),
    obs("sold", 1, "plain", "77"),
  );
  const rates = saleRates(observations, "42", NOW);
  expect(rates).toEqual({
    plain: { sold: 2, total: 3, percent: 67 },
    veil: { sold: 0, total: 1, percent: 0 },
    fullart: { sold: 0, total: 0, percent: null },
  });
  expect(combinedRate(rates, ["plain", "veil", "fullart"])).toEqual({
    sold: 2,
    total: 4,
    percent: 50,
  });
  expect(combinedRate(rates, ["fullart"]).percent).toBeNull();
});

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = structuredClone(initial);
  const storage = {
    get: vi.fn(async (keys: string[] | null) =>
      structuredClone(
        keys === null
          ? data
          : Object.fromEntries(
              keys.filter((k) => k in data).map((k) => [k, data[k]]),
            ),
      ),
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, structuredClone(items));
    }),
    remove: vi.fn(async (keys: string[]) => {
      for (const k of keys) delete data[k];
    }),
  };
  return {
    data,
    storage: storage as unknown as chrome.storage.StorageArea,
    mock: storage,
  };
}

it("saves only the days that changed, without dropping entries from other tabs", async () => {
  vi.useFakeTimers({ now: NOW });
  try {
    const today = bucketKey(NOW),
      older = bucketKey(NOW - 3 * DAY),
      expired = bucketKey(NOW - 40 * DAY);
    const { data, storage, mock } = memoryStorage({
      [older]: serializeObservations(log(obs("unsold", 3))),
      [expired]: serializeObservations(new Map([[id(90), obs("sold", 40)]])),
      "kosmore.settings": { keep: true },
    });
    const store = new SaleObservationStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    await store.load();
    expect(store.observations.size).toBe(2);
    expect(listener).toHaveBeenLastCalledWith(new Set(["42"]));
    // Another tab writes today's day before this tab saves its own entry.
    data[today] = serializeObservations(
      new Map([[id(50), { ...obs("sold", 0, "veil", "8"), endsAt: NOW }]]),
    );
    store.recordMany([
      [id(51), { ...obs("open", 0, "plain", "9"), endsAt: NOW + 1000 }],
      [id(52), { ...obs("open", 0, "plain", "9"), endsAt: NOW + 2000 }],
    ]);
    expect(listener).toHaveBeenLastCalledWith(new Set(["9"]));
    await vi.advanceTimersByTimeAsync(3_500);
    // Only today's day is written; the untouched day is left alone.
    expect(mock.set).toHaveBeenCalledTimes(1);
    expect(Object.keys(mock.set.mock.calls[0][0])).toEqual([today]);
    expect(parseObservations(data[today]).size).toBe(3);
    expect(parseObservations(data[older]).size).toBe(1);
    // The expired day is removed; unrelated keys survive.
    expect(data[expired]).toBeUndefined();
    expect(data["kosmore.settings"]).toEqual({ keep: true });
    // Other tabs' changes arrive per day.
    store.external({
      [older]: {
        newValue: serializeObservations(
          new Map([[id(60), { ...obs("sold", 3, "plain", "7") }]]),
        ),
      },
      "kosmore.settings": { newValue: {} },
    });
    expect(store.observations.has(id(60))).toBe(true);
    expect(listener).toHaveBeenLastCalledWith(new Set(["7"]));
  } finally {
    vi.useRealTimers();
  }
});

it("rewrites the day a listing leaves when its end time moves", async () => {
  vi.useFakeTimers({ now: NOW });
  try {
    const { data, storage } = memoryStorage();
    const store = new SaleObservationStore(storage);
    await store.load();
    store.record(id(1), { ...obs("open"), endsAt: NOW + DAY });
    await vi.advanceTimersByTimeAsync(3_500);
    expect(data[bucketKey(NOW + DAY)]).toBeDefined();
    store.record(id(1), { ...obs("sold"), endsAt: NOW });
    await vi.advanceTimersByTimeAsync(3_500);
    expect(data[bucketKey(NOW + DAY)]).toBeUndefined();
    expect(parseObservations(data[bucketKey(NOW)]).get(id(1))!.outcome).toBe(
      "sold",
    );
  } finally {
    vi.useRealTimers();
  }
});
