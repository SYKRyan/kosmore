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
} from "../../src/shared/listing-cache";
import { myListing } from "../fixtures/my-listings";
class MemoryStore {
  data: Record<string, unknown> = {};
  async get(key: string | string[] | null) {
    return structuredClone(
      key === null
        ? this.data
        : Object.fromEntries([key].flat().map((k) => [k, this.data[k]])),
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

const account = "fixtureplayer";
const id = "42";
const capture = (n: number, submittedAt: number, startPrice = "10000000") => ({
  id: myListing(n).id,
  subjectId: id,
  submittedAt,
  startPrice,
});
const first = async (service: ListingCacheService) =>
  (await service.tracked(account, id)).listings[0];

it("extends history only on demand, saves 100 rows, and can reopen without the session cache", async () => {
  const { service, local } = setup();
  const all = Array.from({ length: 125 }, (_, i) => myListing(i + 1));
  const calls: number[] = [];
  const read = async (limits: ListingLimits) => {
    calls.push(limits.unsold);
    return page(all, limits);
  };
  expect(await service.tracked(account, id)).toEqual({
    listings: [],
    hasMore: true,
  });
  expect(calls).toEqual([]);
  const more = () => service.history(account, id, "more", read, signal());
  expect((await more())?.listings).toHaveLength(50);
  expect((await more())?.listings).toHaveLength(100);
  expect((await more())?.listings).toHaveLength(125);
  expect(calls).toEqual([50, 100, 125]);
  const restarted = new ListingCacheService(local, new MemoryStore());
  const saved = await restarted.tracked(account, id);
  expect(saved.listings.map((r) => r.id)).toEqual(
    all.slice(0, 100).map((r) => r.id),
  );
  expect(saved.hasMore).toBe(true);
  expect((await restarted.tracked("other", id)).listings).toEqual([]);
  expect(calls).toHaveLength(3);
});

it("coalesces explicit refreshes and imports the newest 180 across statuses and cards", async () => {
  const { service } = setup();
  const all = Array.from({ length: 241 }, (_, i) =>
    myListing(i + 1, i === 179 ? "42" : i === 180 ? "43" : "44", {
      group: i % 3 === 0 ? "selling" : i % 3 === 1 ? "sold" : "unsold",
    }),
  );
  let reads = 0;
  const read = async (limits: ListingLimits) => {
    reads++;
    expect(limits).toEqual({ selling: 180, sold: 180, unsold: 180 });
    return page(all, limits);
  };
  await Promise.all(
    [id, "44"].map((subject) =>
      service.history(account, subject, "refresh", read, signal()),
    ),
  );
  expect(reads).toBe(1);
  expect(await first(service)).toMatchObject({ id: all[179].id });
  expect((await service.tracked(account, "43")).listings).toEqual([]);
  expect((await service.tracked(account, "44")).listings).toHaveLength(100);
});

it("retains captured and server-reconciled legacy prices and migrates on the next write", async () => {
  const { service, local } = setup();
  const captured = capture(1, 5000);
  await local.set({
    "kosmore.listingRecord.fixtureplayer.42": {
      latest: captured,
      seen: [captured.id],
      verifiedId: myListing(2).id,
      verifiedPrice: "20000000",
      reconciledAt: 6000,
    },
    [LISTING_PRICE_KEY]: {
      v: 1,
      entries: {
        "fixtureplayer:43": {
          listing: page([myListing(4, "43")], initialListingLimits())
            .listings[0],
        },
      },
    },
  });
  expect(await first(service)).toMatchObject({
    id: myListing(2).id,
    startPrice: "20000000",
  });
  expect((await service.tracked(account, "43")).listings[0]).toMatchObject({
    id: myListing(4).id,
  });
  await service.record(account, [capture(3, 7000)]);
  expect(
    (await service.tracked(account, id)).listings.map((r) => r.id),
  ).toEqual([myListing(3).id, myListing(2).id, captured.id]);
});

it("deduplicates confirmations, prunes old submissions, and keeps out-of-order replies from changing the latest", async () => {
  const { service } = setup();
  await service.record(
    account,
    Array.from({ length: 101 }, (_, i) => capture(i + 1, i + 1000)),
  );
  await service.record(account, [
    capture(101, 3000, "99000000"),
    capture(500, 990),
  ]);
  const saved = await service.tracked(account, id);
  expect(saved.listings).toHaveLength(100);
  expect(saved.listings[0]).toMatchObject({
    id: myListing(101).id,
    submittedAt: 1100,
    startPrice: "10000000",
  });
  expect(saved.listings.at(-1)?.id).toBe(myListing(2).id);
});

it("requires shared server ordering for a different latest price and preserves the price on error", async () => {
  const { service } = setup();
  await service.record(account, [capture(1, Date.now() - 3000)]);
  let rows = [myListing(2)];
  const read = async (limits: ListingLimits) => page(rows, limits);
  await service.history(account, id, "refresh", read, signal());
  expect(await first(service)).toMatchObject({ id: myListing(1).id });
  rows = [myListing(2), myListing(1)];
  await service.history(account, id, "refresh", read, signal());
  expect(await first(service)).toMatchObject({ id: myListing(2).id });
  await expect(
    service.history(
      account,
      id,
      "refresh",
      async () => {
        throw Error("unavailable");
      },
      signal(),
    ),
  ).rejects.toThrow("unavailable");
  expect(await first(service)).toMatchObject({ id: myListing(2).id });
});

it("merges delayed history without overwriting a newer captured price", async () => {
  const { service } = setup();
  let release!: () => void, started!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  await service.record(account, [capture(1, Date.now() - 5000)]);
  const pending = service.history(
    account,
    id,
    "refresh",
    async (limits) => {
      started();
      await hold;
      return page([myListing(2), myListing(1)], limits);
    },
    signal(),
  );
  await ready;
  const latest = capture(3, Date.now() + 1);
  await service.record(account, [latest]);
  await service.invalidate(account);
  release();
  await pending;
  expect(await first(service)).toMatchObject({
    id: latest.id,
    submittedAt: latest.submittedAt,
  });
  expect((await service.tracked(account, id)).listings).toHaveLength(3);
});

it("keeps a shared scan alive until its last consumer leaves", async () => {
  const { service } = setup();
  let release!: () => void, started!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const read = async (limits: ListingLimits, sig: AbortSignal) => {
    started();
    await hold;
    sig.throwIfAborted();
    return page([myListing(1)], limits);
  };
  const a = new AbortController();
  const b = new AbortController();
  const one = service.history(account, id, "refresh", read, a.signal);
  const two = service.history(account, id, "refresh", read, b.signal);
  const rejected = expect(one).rejects.toThrow("canceled");
  await ready;
  a.abort();
  await rejected;
  release();
  await two;
  expect(await first(service)).toMatchObject({ id: myListing(1).id });
});

it("rejects a truncated recent refresh before importing a partial window", async () => {
  const { service } = setup();
  await expect(
    service.history(
      account,
      id,
      "refresh",
      async (limits) => {
        const batch = page([myListing(1)], limits);
        batch.totals.unsold = 200;
        return batch;
      },
      signal(),
    ),
  ).rejects.toThrow("stopped");
  expect(await first(service)).toBeUndefined();
});
