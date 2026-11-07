import { expect, it } from "vitest";
import {
  parseListingBatch,
  initialListingLimits,
  listingComplete,
  type ListingLimits,
  type ListingBatch,
} from "../../src/kosmora/my-listings";
import {
  ListingCacheService,
  LISTING_PRICE_KEY,
  LISTING_SESSION_PREFIX,
} from "../../src/shared/listing-cache";
import { myListing } from "../fixtures/my-listings";
class MemoryStore {
  data: Record<string, unknown> = {};
  async get(key: string | null) {
    return structuredClone(
      key === null ? this.data : { [key]: this.data[key] },
    );
  }
  async set(data: Record<string, unknown>) {
    Object.assign(this.data, structuredClone(data));
  }
  async remove(keys: string | string[]) {
    for (const key of typeof keys === "string" ? [keys] : keys)
      delete this.data[key];
  }
}
const setup = () => {
  const local = new MemoryStore(),
    session = new MemoryStore();
  return { local, session, service: new ListingCacheService(local, session) };
};
const signal = () => new AbortController().signal;
function page(
  items: ReturnType<typeof myListing>[],
  limits: ListingLimits,
): ListingBatch {
  const groups = { selling: 0, sold: 0, unsold: 0 },
    included = { selling: 0, sold: 0, unsold: 0 };
  const selected = items.filter((item) => {
    const group = item.group as keyof typeof groups;
    groups[group]++;
    return included[group]++ < limits[group];
  });
  return parseListingBatch(
    { items: selected, groups },
    "fixtureplayer",
    limits,
  );
}
it("validates personal prices, sellers and finishes without losing group coverage", () => {
  const result = page(
    [
      myListing(1, "42", { finalPrice: "99000000", veil: true, group: "sold" }),
      myListing(2, "46", { fullArt: true }),
      myListing(3, "42", { seller: "OtherPlayer" }),
      myListing(4, "42", { yours: false }),
    ],
    initialListingLimits(),
  );
  expect(
    result.listings.map((i) => [i.subjectId, i.startPrice, i.finish]),
  ).toEqual([
    ["42", "17000000", "veil"],
    ["46", "17000000", "fullart"],
  ]);
  expect(listingComplete(result)).toBe(true);
  for (const override of [
    { startPrice: "bad" },
    { endsAt: "bad" },
    { group: "unknown" },
  ])
    expect(() =>
      parseListingBatch(
        {
          items: [myListing(1, "42", override)],
          groups: { selling: 0, sold: 0, unsold: 1 },
        },
        "fixtureplayer",
        initialListingLimits(),
      ),
    ).toThrow();
});
it("loads one history batch, doubles only on demand and restores larger cached coverage", async () => {
  const { service } = setup(),
    limits: number[] = [];
  const items = Array.from({ length: 150 }, (_, i) =>
    myListing(i + 1, i === 100 ? "42" : "46"),
  );
  const read = async (next: ListingLimits) => {
    limits.push(next.unsold);
    return page(items, next);
  };
  const first = await service.history(
    "fixtureplayer",
    "42",
    "initial",
    read,
    signal(),
  );
  expect(first.listings.some((i) => i.subjectId === "42")).toBe(false);
  expect(listingComplete(first)).toBe(false);
  expect(limits).toEqual([50]);
  await service.history("fixtureplayer", "42", "more", read, signal());
  const last = await service.history(
    "fixtureplayer",
    "42",
    "more",
    read,
    signal(),
  );
  expect(limits).toEqual([50, 100, 150]);
  expect(listingComplete(last)).toBe(true);
  expect(
    (await service.history("fixtureplayer", "42", "initial", read, signal()))
      .listings,
  ).toHaveLength(150);
  expect(limits).toHaveLength(3);
});
it("confirms the newest price across groups without scanning unrelated older listings", async () => {
  const { service } = setup(),
    sizes: number[] = [];
  const items = [
    ...Array.from({ length: 5000 }, (_, i) =>
      myListing(i + 1, i === 75 ? "42" : "46", { startPrice: "23000000" }),
    ),
    myListing(6000, "42", { group: "sold", startPrice: "10000000" }),
  ];
  const result = await service.latest(
    "fixtureplayer",
    "42",
    async (limits) => {
      sizes.push(limits.unsold);
      return page(items, limits);
    },
    signal(),
  );
  expect(result.listing?.startPrice).toBe("23000000");
  expect(sizes).toEqual([50, 100]);
});
it("shares in-flight reads but publishes a resolved card before another card's older lookup", async () => {
  const { service } = setup();
  let reads = 0,
    release!: () => void,
    held = false;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const items = Array.from({ length: 150 }, (_, i) =>
    myListing(i + 1, i === 100 ? "46" : "42"),
  );
  const read = async (limits: ListingLimits) => {
    reads++;
    if (limits.unsold > 50) {
      held = true;
      await wait;
    }
    return page(items, limits);
  };
  const first = service.latest("fixtureplayer", "42", read, signal());
  const second = service.latest("fixtureplayer", "46", read, signal());
  expect((await first).listing?.subjectId).toBe("42");
  await expect.poll(() => held).toBe(true);
  expect(reads).toBe(2);
  release();
  expect((await second).listing?.subjectId).toBe("46");
  expect(reads).toBe(3);
});
it("cancels the final consumer without canceling another tab's subscription", async () => {
  const { service } = setup();
  let release!: () => void, shared!: AbortSignal;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = async (limits: ListingLimits, input: AbortSignal) => {
    shared = input;
    await waiting;
    input.throwIfAborted();
    return page([myListing(1)], limits);
  };
  const a = new AbortController(),
    b = new AbortController();
  const first = service.history(
    "fixtureplayer",
    "42",
    "initial",
    read,
    a.signal,
  );
  const rejected = expect(first).rejects.toThrow();
  const second = service.history(
    "fixtureplayer",
    "42",
    "initial",
    read,
    b.signal,
  );
  await expect.poll(() => !!shared).toBe(true);
  a.abort();
  await rejected;
  expect(shared.aborted).toBe(false);
  release();
  expect((await second).listings).toHaveLength(1);
  const c = new AbortController();
  const pending = service.history(
    "other",
    "42",
    "initial",
    async (_, input) =>
      new Promise((_, reject) =>
        input.addEventListener("abort", () => reject(input.reason)),
      ),
    c.signal,
  );
  const cancel = expect(pending).rejects.toThrow();
  c.abort();
  await cancel;
});
it("persists confirmed prices across restarts, isolates accounts, expires and invalidates them", async () => {
  const { local, session, service } = setup();
  const read = async (limits: ListingLimits) => page([myListing(1)], limits);
  await service.latest("fixtureplayer", "42", read, signal());
  session.data = {};
  const restarted = new ListingCacheService(local, session);
  const saved = await restarted.cached("fixtureplayer", "42");
  expect(saved.latest?.listing?.startPrice).toBe("17000000");
  expect((await restarted.cached("other", "42")).latest).toBeUndefined();
  expect(
    (
      await restarted.latest(
        "fixtureplayer",
        "42",
        async () => {
          throw Error("must use cache");
        },
        signal(),
      )
    ).listing,
  ).toBeTruthy();
  await restarted.invalidate("fixtureplayer");
  expect(
    (await restarted.cached("fixtureplayer", "42")).latest?.checkedAt,
  ).toBe(0);
  const updated = await restarted.latest(
    "fixtureplayer",
    "42",
    async (limits) =>
      page([myListing(2, "42", { startPrice: "19000000" })], limits),
    signal(),
  );
  expect(updated.listing?.startPrice).toBe("19000000");
  const index = local.data[LISTING_PRICE_KEY] as {
    entries: Record<string, { checkedAt: number }>;
  };
  index.entries["fixtureplayer:42"].checkedAt = Date.now() - 300_001;
  const batch = session.data[
    LISTING_SESSION_PREFIX + "fixtureplayer"
  ] as ListingBatch;
  batch.fetchedAt = Date.now() - 300_001;
  const empty = await restarted.latest(
    "fixtureplayer",
    "42",
    async (limits) => page([], limits),
    signal(),
  );
  expect(empty.listing).toBeNull();
});
it("retains cached history on errors and rejects non-advancing expanded pages", async () => {
  const { service } = setup();
  const read = async (limits: ListingLimits) => ({
    ...page([myListing(1)], limits),
    totals: { selling: 0, sold: 0, unsold: 100 },
  });
  await service.history("fixtureplayer", "42", "initial", read, signal());
  await expect(
    service.history("fixtureplayer", "42", "more", read, signal()),
  ).rejects.toThrow("stopped");
  await expect(
    service.history(
      "fixtureplayer",
      "42",
      "refresh",
      async () => {
        throw Error("offline");
      },
      signal(),
    ),
  ).rejects.toThrow("offline");
  expect(
    (await service.cached("fixtureplayer", "42")).batch?.listings,
  ).toHaveLength(1);
});

it("uses a manually refreshed history rather than returning an older otherwise-fresh price", async () => {
  const { service } = setup();
  await service.latest(
    "fixtureplayer",
    "42",
    async (limits) => page([myListing(1)], limits),
    signal(),
  );
  await service.history(
    "fixtureplayer",
    "42",
    "refresh",
    async (limits) =>
      page([myListing(2, "42", { startPrice: "29000000" })], limits),
    signal(),
  );
  const latest = await service.latest(
    "fixtureplayer",
    "42",
    async () => {
      throw Error("must use refreshed batch");
    },
    signal(),
  );
  expect(latest.listing?.startPrice).toBe("29000000");
});
it("bounds the persistent price index to 10,000 least-recently-used entries", async () => {
  const { local, service } = setup();
  local.data[LISTING_PRICE_KEY] = {
    v: 1,
    entries: Object.fromEntries(
      Array.from({ length: 10_000 }, (_, i) => [
        `fixtureplayer:${i}`,
        { listing: null, checkedAt: 1, usedAt: i },
      ]),
    ),
  };
  await service.latest(
    "fixtureplayer",
    "20000",
    async (limits) => page([], limits),
    signal(),
  );
  const index = local.data[LISTING_PRICE_KEY] as {
    entries: Record<string, unknown>;
  };
  expect(Object.keys(index.entries)).toHaveLength(10_000);
  expect(index.entries["fixtureplayer:0"]).toBeUndefined();
  expect(index.entries["fixtureplayer:20000"]).toBeTruthy();
});

it("discards an old in-flight response after a listing invalidation", async () => {
  const { service } = setup();
  let release!: () => void,
    started = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = service.latest(
    "fixtureplayer",
    "42",
    async (limits) => {
      started = true;
      await held;
      return page([myListing(1)], limits);
    },
    signal(),
  );
  const rejected = expect(pending).rejects.toThrow();
  await expect.poll(() => started).toBe(true);
  await service.invalidate("fixtureplayer");
  release();
  await rejected;
  const cached = await service.cached("fixtureplayer", "42");
  expect(cached.latest).toBeUndefined();
  expect(cached.batch).toBeUndefined();
});

it("continues a shared request through another game tab when its original reader closes", async () => {
  const { service } = setup();
  let release!: () => void,
    started = false,
    fallback = 0;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const a = new AbortController();
  const first = service.history(
    "fixtureplayer",
    "42",
    "initial",
    async () => {
      started = true;
      await held;
      throw Error("Receiving end does not exist");
    },
    a.signal,
  );
  const rejected = expect(first).rejects.toThrow();
  await expect.poll(() => started).toBe(true);
  const second = service.history(
    "fixtureplayer",
    "42",
    "initial",
    async (limits) => {
      fallback++;
      return page([myListing(1)], limits);
    },
    signal(),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  a.abort();
  await rejected;
  release();
  expect((await second).listings).toHaveLength(1);
  expect(fallback).toBe(1);
});
it.each([
  [1000, 6, 2550],
  [5000, 8, 11350],
])(
  "benchmarks complete cold misses over %i listings",
  async (total, expectedRequests, expectedRows) => {
    const { service } = setup();
    const items = Array.from({ length: total }, (_, i) =>
      myListing(i + 1, "46"),
    );
    let requests = 0,
      rows = 0;
    const result = await service.latest(
      "fixtureplayer",
      "42",
      async (limits) => {
        const batch = page(items, limits);
        requests++;
        rows += batch.counts.unsold;
        return batch;
      },
      signal(),
    );
    expect(result.listing).toBeNull();
    expect(requests).toBe(expectedRequests);
    expect(rows).toBe(expectedRows);
    console.log(JSON.stringify({ listings: total, requests, rows }));
  },
);
