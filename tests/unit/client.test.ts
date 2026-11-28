import { afterEach, it, expect, vi } from "vitest";
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
} from "../fixtures/data";
import { serviceDetails } from "../fixtures/services";
import { parseServicesCard } from "../../src/shared/services";
import type { CardContext } from "../../src/shared/types";
afterEach(() => vi.unstubAllGlobals());
function serviceMessages(wait?: Promise<void>) {
  const send = vi.fn(async (message: { requestId: string; ids: string[] }) => {
    await wait;
    return {
      requestId: message.requestId,
      ok: true,
      data: Object.fromEntries(
        message.ids.map((id) => [
          id,
          {
            card: parseServicesCard(serviceDetails(id), id),
            stale: false,
            until: Date.now() + 300_000,
          },
        ]),
      ),
    };
  });
  vi.stubGlobal("chrome", { runtime: { sendMessage: send } });
  return send;
}

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
  serviceMessages(held);
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
  ).toHaveLength(0);
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
    Array.from({ length: 10 }, (_, i) => client.albums(String(i + 1))),
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
  serviceMessages();
  const client = h.client;
  await client.observeCardDetails(card());
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
  expect(await client.history("42", "plain")).toEqual(history);
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
        if (full) return Response.json({}, { status: 409 });
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
        const d = albums(added, full ? 2000 : undefined);
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
  await h.client.observeCardDetails(card());
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
  await h.client.observeCardDetails(card());
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
it("reports a server rejection for a full album without repeating the write", async () => {
  const h = harness({ full: true });
  await h.client.observeCardDetails(card());
  const copy = {
    id: COPY_A,
    subjectId: "42",
    state: "available",
    variant: { veil: false, fullArt: false },
  };
  await expect(h.client.add(ALBUM_A, copy, "fixtureplayer")).rejects.toMatchObject({
    status: 409,
  });
  expect(h.posts()).toBe(1);
  expect((await h.client.albums("42"))[0].contains).toBe(false);
});
it("rejects unowned copies and account switches before writing", async () => {
  for (const opts of [{ other: true }, {}]) {
    const h = harness(opts);
    await h.client.observeCardDetails(card());
    await expect(
      h.client.add(
        ALBUM_A,
        {
          id: opts.other ? COPY_A : COPY_B,
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
  await h.client.receivePackData({ kind: "opening", data: opening });
  await h.client.observeCardDetails({
    ...card(),
    copies: [...card().copies, { ...card().copies[0], id: COPY_B }],
  });
  const ctx = {
    subjectId: "42",
    name: "Northern Lights",
    anchor: document.body,
    surface: "summary",
    openingIds: [opening.id],
    entryIndex: 1,
    variant: { veil: false, fullArt: false },
  } as CardContext;
  expect(
    (await h.client.tooltipCopies(ctx, "fixtureplayer", true)).chosen?.id,
  ).toBe(COPY_B);
  expect(
    (
      await h.client.tooltipCopies(
        { ...ctx, entryIndex: undefined },
        "fixtureplayer",
        true,
      )
    ).chosen,
  ).toBeUndefined();
  expect(h.fetcher.mock.calls.map(([path]) => path)).toEqual(["/api/me"]);
});

it("loads missing opening and ownership once for pinned albums and leaves an unowned pack slot unselected", async () => {
  const h = harness();
  await h.client.account();
  const ctx: CardContext = {
    subjectId: "42",
    name: "Northern Lights",
    anchor: document.body,
    surface: "summary",
    openingIds: [opening.id],
    entryIndex: 0,
    variant: { veil: false, fullArt: false },
  };
  expect(
    (await h.client.tooltipCopies(ctx, "fixtureplayer", false)).copies,
  ).toBeUndefined();
  expect(h.fetcher).toHaveBeenCalledTimes(1);
  expect(
    (await h.client.tooltipCopies(ctx, "fixtureplayer", true)).chosen?.id,
  ).toBe(COPY_A);
  const other = await h.client.tooltipCopies(
    { ...ctx, entryIndex: 1 },
    "fixtureplayer",
    true,
  );
  expect(other.chosen).toBeUndefined();
  expect(other.problem).toBeTruthy();
  expect(other.copies?.map((copy) => copy.id)).toEqual([COPY_A]);
  expect(h.fetcher.mock.calls.map(([path]) => path)).toEqual([
    "/api/me",
    "/api/openings/" + opening.id,
    "/api/collection/42",
  ]);
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
  const messages = serviceMessages();
  // Fusion badges and card overlays reading the same card.
  await Promise.all([client.insights("42"), client.insights("42")]);
  expect(messages).toHaveBeenCalledTimes(1);
  expect(
    fetcher.mock.calls.filter(([u]) => String(u) === "/api/collection/42"),
  ).toHaveLength(0);
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

it("coalesces concurrent pack inventory checks without another account request", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
    Response.json({ packs: [{ status: "ready", openingId: OPENING }] }),
  );
  const client = new GameClient(fetcher);
  expect(
    await Promise.all([client.readyPackIds(), client.readyPackIds()]),
  ).toEqual([[OPENING], [OPENING]]);
  expect(fetcher.mock.calls.map(([input]) => input)).toEqual([
    "/api/packs/inventory",
  ]);
});

it("uses Services for market counts, summaries and price chips without game requests", async () => {
  const requests = serviceMessages();
  const game = vi.fn(async () => {
    throw new Error("Unexpected Kosmora request");
  });
  const client = new GameClient(game as typeof fetch);
  const results = await Promise.all([
    client.hasSaleHistory("42", "plain"),
    client.hasSaleHistory("42", "veil"),
    client.activeAuctions("42", "plain"),
    client.lowestListing("42", "plain"),
    client.history("42", "plain"),
  ]);
  expect(results).toEqual([
    true,
    false,
    1,
    { price: "7500000", bids: 3 },
    expect.objectContaining({
      count: 1,
      median: "6500000",
      lastSale: expect.objectContaining({ price: "6500000" }),
    }),
  ]);
  expect(game).not.toHaveBeenCalled();
  expect(requests).toHaveBeenCalledTimes(1);
});

it("does not use the absence of a listing to infer an unsold outcome", async () => {
  const client = new GameClient();
  const signal = new AbortController().signal;
  const one = { id: "1", startPrice: "19", group: "unsold" } as const;
  const two = { id: "2", startPrice: "29", group: "unsold" } as const;
  const unknown = { id: "3", startPrice: "39" };
  expect(
    await client.discountListingPrice("42", "", 2, [one, two], signal),
  ).toBe("19");
  expect(
    await client.discountListingPrice("42", "", 2, [one, unknown, two], signal),
  ).toBeUndefined();
  expect(
    await client.discountListingPrice(
      "42",
      "",
      1,
      [{ ...unknown, group: "selling" }, one],
      signal,
    ),
  ).toBeUndefined();
});
