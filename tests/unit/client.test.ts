import { it, expect, vi } from "vitest";
import { GameClient } from "../../src/kosmora/client";
import {
  ALBUM_A,
  COPY_A,
  COPY_B,
  OPENING,
  albums,
  card,
  me,
  opening,
  prices,
} from "../fixtures/data";
import { auction } from "../fixtures/auctions";
import type { CardContext } from "../../src/shared/types";
it("honors server throttling without retrying or sending further requests during the cooldown", async () => {
  const fetcher = vi.fn(async () =>
    Response.json(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": "10" } },
    ),
  );
  const client = new GameClient(fetcher as typeof fetch);
  await expect(client.account()).rejects.toThrow("rate limiting");
  await expect(client.account()).rejects.toThrow("rate limiting");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("briefly caches display account checks while actions still verify the server", async () => {
  let handle = me.handle;
  const fetcher = vi.fn(async () => Response.json({ ...me, handle }));
  const client = new GameClient(fetcher as typeof fetch);
  await Promise.all([
    client.account(undefined, false),
    client.account(undefined, false),
  ]);
  await client.account(undefined, false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  handle = "OtherAccount";
  expect((await client.account()).key).toBe("otheraccount");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("discards late private reads from an account that changed during loading", async () => {
  let handle = me.handle;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/me") return Response.json({ ...me, handle });
    await held;
    return Response.json(card());
  });
  const client = new GameClient(fetcher as typeof fetch);
  await client.account();
  const pending = client.insights("42");
  const rejected = expect(pending).rejects.toThrow("account changed");
  handle = "OtherAccount";
  await client.account();
  release();
  await rejected;
  await client.insights("42");
  expect(
    fetcher.mock.calls.filter(([path]) =>
      String(path).startsWith("/api/collection/"),
    ),
  ).toHaveLength(2);
});
it("bounds concurrent network reads and stops queued fetches after a server cooldown", async () => {
  const releases: (() => void)[] = [];
  let active = 0,
    peak = 0;
  const fetcher = vi.fn(async () => {
    peak = Math.max(peak, ++active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active--;
    return Response.json({}, { status: 429, headers: { "Retry-After": "30" } });
  });
  const client = new GameClient(fetcher as typeof fetch);
  const tasks = Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => client.insights(String(i + 1))),
  );
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  for (const release of releases) release();
  const results = await tasks;
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(peak).toBe(3);
});
it("album updates retain unrelated price history while refreshing membership before writes", async () => {
  const h = harness();
  const client = new GameClient(async (input, init) => {
    if (String(input).includes("/prices?"))
      return Response.json({
        prices: {
          count: 0,
          days: 30,
          low: null,
          median: null,
          high: null,
          sales: [],
        },
      });
    return h.fetcher(input, init);
  });
  await client.account();
  const history = await client.history("42", "plain");
  await client.albums("42");
  await client.add(
    ALBUM_A,
    {
      id: COPY_A,
      subjectId: "42",
      state: "available",
      variant: { veil: false, fullArt: false },
    },
    "fixtureplayer",
  );
  expect(await client.history("42", "plain")).toBe(history);
  expect((await client.albums("42"))[0].contains).toBe(true);
  expect(h.posts()).toBe(1);
});
function harness({
  contains = false,
  timeout = false,
  full = false,
  other = false,
  missingAlbum = false,
  unknownMembership = false,
  removeFailure = false,
  removeNoChange = false,
} = {}) {
  let added = contains,
    posts = 0,
    deletes = 0;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "DELETE") {
        deletes++;
        // Kosmora's JSON transport sends {} even when the caller supplies no payload.
        if (init.body !== "{}")
          return Response.json({ code: "invalid_json" }, { status: 400 });
        if (removeFailure)
          return Response.json({ error: "unavailable" }, { status: 503 });
        if (!removeNoChange) added = false;
        if (timeout) throw new TypeError("network failed after commit");
        return Response.json({ position: 1, copyId: COPY_B });
      }
      if (init?.method === "POST") {
        posts++;
        added = true;
        if (timeout) throw new TypeError("network failed after commit");
        return Response.json({ added: 1 });
      }
      if (path === "/api/me")
        return Response.json({
          ...me,
          handle: other ? "OtherAccount" : me.handle,
        });
      if (path.startsWith("/api/collection/")) return Response.json(card());
      if (path.startsWith("/api/albums")) {
        const d = albums(added);
        if (full) d.albums[0].items = 2000;
        if (unknownMembership)
          delete (d.albums[0] as { contains?: boolean }).contains;
        if (missingAlbum) d.albums = [];
        return Response.json(d);
      }
      if (path.startsWith("/api/openings/")) return Response.json(opening);
      throw Error(path);
    },
  );
  return {
    client: new GameClient(fetcher as typeof fetch),
    fetcher,
    posts: () => posts,
    deletes: () => deletes,
  };
}
it("removes the exact album subject without requiring a selected or currently owned copy", async () => {
  const h = harness({ contains: true });
  await h.client.remove(ALBUM_A, "00042", "fixtureplayer");
  expect(h.deletes()).toBe(1);
  expect(h.posts()).toBe(0);
  const deletion = h.fetcher.mock.calls.find(
    ([, init]) => init?.method === "DELETE",
  )!;
  expect(deletion[0]).toBe(`/api/albums/${ALBUM_A}/items/42`);
  expect(deletion[1]?.body).toBe("{}");
  expect(deletion[1]?.headers).toMatchObject({
    "x-kosmora": "1",
    "Content-Type": "application/json",
  });
  expect(
    h.fetcher.mock.calls.some(([path]) =>
      String(path).startsWith("/api/collection/"),
    ),
  ).toBe(false);
});
it("confirms a committed removal after a lost response without retrying DELETE", async () => {
  const h = harness({ contains: true, timeout: true });
  await h.client.remove(ALBUM_A, "42", "fixtureplayer");
  expect(h.deletes()).toBe(1);
  expect(h.posts()).toBe(0);
});
it("does not remove an absent subject or write after unverified membership or an account change", async () => {
  const absent = harness();
  await absent.client.remove(ALBUM_A, "42", "fixtureplayer");
  expect(absent.deletes()).toBe(0);
  for (const options of [
    { other: true },
    { missingAlbum: true },
    { unknownMembership: true },
  ]) {
    const h = harness({ contains: true, ...options });
    await expect(
      h.client.remove(ALBUM_A, "42", "fixtureplayer"),
    ).rejects.toThrow();
    expect(h.deletes()).toBe(0);
    expect(h.posts()).toBe(0);
  }
});
it("rejects invalid removal identifiers and never reports an unconfirmed removal as success", async () => {
  const h = harness({ contains: true });
  await expect(h.client.remove("bad", "42", "fixtureplayer")).rejects.toThrow();
  await expect(
    h.client.remove(ALBUM_A, "42/anything", "fixtureplayer"),
  ).rejects.toThrow();
  expect(h.fetcher).not.toHaveBeenCalled();
  for (const options of [{ removeFailure: true }, { removeNoChange: true }]) {
    const failed = harness({ contains: true, ...options });
    await expect(
      failed.client.remove(ALBUM_A, "42", "fixtureplayer"),
    ).rejects.toThrow();
    expect(failed.deletes()).toBe(1);
    expect(failed.posts()).toBe(0);
  }
});
it("serializes removals and additions for the same album subject", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let contains = true;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        await held;
        contains = false;
        return Response.json({});
      }
      return Response.json(String(input) === "/api/me" ? me : albums(contains));
    },
  );
  const client = new GameClient(fetcher as typeof fetch);
  const pending = client.remove(ALBUM_A, "42", "fixtureplayer");
  await expect(client.remove(ALBUM_A, "42", "fixtureplayer")).rejects.toThrow(
    "already in progress",
  );
  await expect(
    client.add(
      ALBUM_A,
      {
        id: COPY_A,
        subjectId: "42",
        state: "available",
        variant: { veil: false, fullArt: false },
      },
      "fixtureplayer",
    ),
  ).rejects.toThrow("already in progress");
  release();
  await pending;
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(1);
});
it("checks membership and never toggles or rewrites an existing album", async () => {
  const h = harness({ contains: true });
  await h.client.add(
    ALBUM_A,
    {
      id: COPY_A,
      subjectId: "42",
      state: "available",
      variant: { veil: false, fullArt: false },
    },
    "fixtureplayer",
  );
  expect(h.posts()).toBe(0);
});
it("uses only the explicit add endpoint and confirms a timeout without repeating the write", async () => {
  const h = harness({ timeout: true });
  await h.client.add(
    ALBUM_A,
    {
      id: COPY_A,
      subjectId: "42",
      state: "available",
      variant: { veil: false, fullArt: false },
    },
    "fixtureplayer",
  );
  expect(h.posts()).toBe(1);
  const write = h.fetcher.mock.calls.find(([, i]) => i?.method === "POST")!;
  expect(write[0]).toBe(`/api/albums/${ALBUM_A}/items`);
  expect(JSON.parse(write[1]!.body as string)).toEqual({
    subjectIds: ["42"],
    copyId: COPY_A,
  });
});
it("rejects unowned copies, full albums, and account switches before writing", async () => {
  for (const opts of [{ full: true }, { other: true }, {}]) {
    const h = harness(opts);
    await expect(
      h.client.add(
        ALBUM_A,
        {
          id: opts.full || opts.other ? COPY_A : COPY_B,
          subjectId: "42",
          state: "available",
          variant: { veil: false, fullArt: false },
        },
        "fixtureplayer",
      ),
    ).rejects.toThrow();
    expect(h.posts()).toBe(0);
  }
});
it("resolves repeated subjects by verified opening slot plus identity", async () => {
  const h = harness();
  await h.client.account();
  const copies = [...card().copies, { ...card().copies[0], id: COPY_B }].map(
    (c) => ({
      id: c.id,
      subjectId: "42",
      state: c.state,
      variant: { veil: false, fullArt: false },
    }),
  );
  const ctx = {
    subjectId: "42",
    name: "Northern Lights",
    anchor: document.body,
    surface: "summary",
    openingIds: [opening.id],
    entryIndex: 1,
    variant: { veil: false, fullArt: false },
  } as CardContext;
  expect((await h.client.resolveCopy(ctx, copies))?.id).toBe(COPY_B);
  expect(
    await h.client.resolveCopy({ ...ctx, entryIndex: undefined }, copies),
  ).toBeUndefined();
});

it("pages through family counts past Kosmora's 1000-family limit", async () => {
  const family = (i: number) => ({ id: `f${i}`, collected: i });
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://kosmora.io");
    if (url.pathname === "/api/me") return Response.json(me);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const size = offset === 0 ? 1000 : 200;
    return Response.json({
      total: 1200,
      families: Array.from({ length: size }, (_, i) => family(offset + i)),
    });
  });
  const client = new GameClient(fetcher as typeof fetch);
  const counts = await client.familyCounts();
  expect(counts.size).toBe(1200);
  expect(counts.get("f1199")).toBe(1199);
  expect(
    fetcher.mock.calls
      .map(([input]) => String(input))
      .filter((u) => u.includes("/me/families")),
  ).toEqual([
    "/api/me/families?sort=closest&limit=1000",
    "/api/me/families?sort=closest&limit=1000&offset=1000",
  ]);
});

it("shares one card read between callers once the account is known", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) =>
    String(input) === "/api/me" ? Response.json(me) : Response.json(card("42")),
  );
  const client = new GameClient(fetcher as typeof fetch);
  await client.account(undefined, false);
  // Fusion badges and card overlays reading the same card.
  await Promise.all([client.insights("42"), client.insights("42")]);
  await client.insights("42");
  expect(
    fetcher.mock.calls.filter(([u]) => String(u) === "/api/collection/42"),
  ).toHaveLength(1);
});

it("queries only the requested family IDs and falls back if one is missing", async () => {
  const paths: URL[] = [];
  let omit = false;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://kosmora.io");
    paths.push(url);
    if (url.pathname === "/api/me") return Response.json(me);
    const rows = [
      { id: "first", collected: 2 },
      { id: "second", collected: 3 },
    ];
    const ids = url.searchParams.get("ids");
    return Response.json({
      families: ids
        ? rows.filter((row) => !omit && ids.split(",").includes(row.id))
        : rows,
      total: rows.length,
    });
  });
  const client = new GameClient(fetcher);
  await client.account();
  expect(await client.familyCountsFor(["second", "second"])).toEqual(
    new Map([["second", 3]]),
  );
  expect(paths[1].searchParams.get("ids")).toBe("second");
  expect(paths[1].searchParams.get("limit")).toBe("1");
  omit = true;
  expect((await client.familyCountsFor(["first"])).get("first")).toBe(2);
  expect(paths[2].searchParams.get("ids")).toBe("first");
  expect(paths[3].searchParams.has("ids")).toBe(false);
});

it("shares the pack inventory fallback and uses the game's newer ready snapshot", async () => {
  const another = "abcdef12-0000-4000-8000-000000000001";
  const fetcher = vi.fn(async (input: RequestInfo | URL) =>
    Response.json(
      String(input) === "/api/me"
        ? me
        : {
            packs: [{ status: "ready", openingId: OPENING }],
          },
    ),
  );
  const client = new GameClient(fetcher);
  expect(
    await Promise.all([client.readyPackIds(), client.readyPackIds()]),
  ).toEqual([[OPENING], [OPENING]]);
  await client.receivePackData({
    kind: "inventory",
    ids: [OPENING, another],
    requestedAt: Date.now(),
  });
  await client.receivePackData({ kind: "opened", id: OPENING });
  expect(await client.readyPackIds()).toEqual([another]);
  expect(fetcher.mock.calls.map(([input]) => input)).toEqual([
    "/api/me",
    "/api/packs/inventory",
  ]);
});

it("uses count-only sale history for icons when collection is paused", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ prices: { days: 30, count: 1 } }),
  );
  const client = new GameClient(fetcher as typeof fetch);
  const evidence = vi.fn();
  client.onHistoryLoaded(evidence);
  client.setSaleRateCollection(false);
  await expect(client.hasSaleHistory("42", "plain")).resolves.toBe(true);
  await expect(client.hasSaleHistory("42", "plain")).resolves.toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(client.history("42", "plain")).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(evidence).not.toHaveBeenCalled();
});

it("stops positive icon searches early when paused and keeps pagination when collecting", async () => {
  const offsets: number[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const offset = Number(
      new URL(String(input), "https://kosmora.io").searchParams.get("offset"),
    );
    offsets.push(offset);
    return Response.json({
      items: [
        auction(offset + 1, offset ? "42" : "44", {
          startPrice: offset === 2 ? "5000000" : "10000000",
        }),
      ],
      nextOffset: offset === 2 ? null : offset + 1,
    });
  });
  const client = new GameClient(fetcher as typeof fetch);
  const evidence = vi.fn();
  client.onAuctionListings(evidence);
  client.setSaleRateCollection(false);
  await expect(client.hasActiveAuctions("42", "fixture")).resolves.toBe(true);
  expect(offsets.splice(0)).toEqual([0, 1]);
  expect(evidence).not.toHaveBeenCalled();
  await expect(client.hasActiveAuctions("43", "fixture")).resolves.toBe(false);
  expect(offsets.splice(0)).toEqual([0, 1, 2]);
  client.setSaleRateCollection(true);
  await expect(client.hasActiveAuctions("42", "fixture")).resolves.toBe(true);
  expect(offsets.splice(0)).toEqual([0, 1, 2]);
  expect(evidence).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ id: auction(2).id }),
      expect.objectContaining({ id: auction(3).id }),
    ]),
  );
  await expect(client.lowestListingPrice("42", "fixture")).resolves.toBe(
    "5000000",
  );
  expect(offsets).toEqual([0, 1, 2]);
});

it("passes icon history to settlement only when it came from a network read", async () => {
  const fetcher = vi.fn(async () => Response.json(prices(3)));
  const client = new GameClient(fetcher as typeof fetch);
  const evidence = vi.fn();
  client.onHistoryLoaded(evidence);
  await expect(client.hasSaleHistory("42", "plain")).resolves.toBe(true);
  expect(evidence).toHaveBeenCalledWith(
    "42",
    expect.objectContaining({ count: 3 }),
    expect.any(Number),
  );
  await expect(client.hasSaleHistory("42", "plain")).resolves.toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(evidence).toHaveBeenCalledOnce();
});

it("reuses live auction price and presence for 60 seconds and permits an explicit refresh", async () => {
  const clock = vi.spyOn(Date, "now");
  const at = Date.now();
  try {
    clock.mockReturnValue(at);
    const fetcher = vi.fn(async () =>
      Response.json({ items: [auction(1)], nextOffset: null }),
    );
    const client = new GameClient(fetcher as typeof fetch);
    client.setSaleRateCollection(false);
    await client.hasActiveAuctions("42", "Presence");
    await client.lowestListingPrice("42", "Price");
    clock.mockReturnValue(at + 59_999);
    await client.hasActiveAuctions("42", "Presence");
    await client.lowestListingPrice("42", "Price");
    expect(fetcher).toHaveBeenCalledTimes(2);
    clock.mockReturnValue(at + 60_000);
    await client.hasActiveAuctions("42", "Presence");
    await client.lowestListingPrice("42", "Price");
    expect(fetcher).toHaveBeenCalledTimes(4);
    await client.lowestListingPrice("42", "Price", undefined, true);
    expect(fetcher).toHaveBeenCalledTimes(5);
  } finally {
    clock.mockRestore();
  }
});
