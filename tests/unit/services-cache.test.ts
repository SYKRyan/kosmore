import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { installServicesBackground } from "../../src/services-background";
import { GameClient } from "../../src/kosmora/client";
import {
  parseServicesCard,
  servicesBase,
  servicesPermission,
} from "../../src/shared/services";
import { observedCardIds } from "../../src/page-relay-install";
import { serviceRow } from "../fixtures/services";
import { me } from "../fixtures/data";

const database = vi.hoisted(() => ({
  connection: {
    base: "https://services.example.com/test",
    session: {
      token: "fixture",
      playerId: "000000000000000000000001",
      handle: "FixturePlayer",
      expiresAt: Date.UTC(2099, 0, 1),
    },
  },
  cards: new Map(),
  listings: new Map(),
}));
vi.mock("../../src/services-card-store", () => ({
  ServicesCardStore: class {
    async connection() {
      return structuredClone(database.connection);
    }
    async getCards(keys: string[]) {
      return keys.map((key) => database.cards.get(key));
    }
    async get(store: "cards" | "listings", key: string) {
      return database[store].get(key);
    }
    async save(
      cards: { key: string }[],
      listings: { key: string }[],
      signal: AbortSignal,
    ) {
      signal.throwIfAborted();
      for (const row of cards) database.cards.set(row.key, row);
      for (const row of listings) database.listings.set(row.key, row);
    }
    async saveConnection(value: typeof database.connection) {
      database.connection = value;
      database.listings.clear();
    }
    async prune(before: number) {
      for (const name of ["cards", "listings"] as const)
        for (const [key, row] of database[name])
          if (row.fetchedAt <= before) database[name].delete(key);
    }
  },
}));

afterEach(() => vi.unstubAllGlobals());

it("shares public batches and loads one independent listing snapshot only on private demand", async () => {
  database.cards.clear();
  database.listings.clear();
  type Listener = (
    message: unknown,
    sender: unknown,
    reply: (data: any) => void,
  ) => boolean;
  let listener!: Listener;
  const calls: { ids: string[]; includeMyListings: boolean }[] = [];
  let listingCalls = 0;
  let outage = false;
  let freshness = 300;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("card-cache-config.json"))
        return Response.json({
          retentionDays: 30,
          freshnessSeconds: freshness,
        });
      if (url.endsWith("/v1/me/listings")) {
        listingCalls++;
        return Response.json({ auctions: serviceRow("42").myListings });
      }
      expect(url).toBe("https://services.example.com/test/v1/cards/details");
      const batch = JSON.parse(String(init?.body)) as (typeof calls)[number];
      calls.push(batch);
      if (outage)
        return new Response(null, {
          status: 503,
          headers: { "Retry-After": "30" },
        });
      return Response.json({
        myListingsStatus: "fresh",
        cards: batch.ids.map((id) => serviceRow(id)),
      });
    }),
  );
  const sessionData: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: async (key: string) => ({ [key]: sessionData[key] }),
        set: async (patch: Record<string, unknown>) => {
          Object.assign(sessionData, patch);
        },
        remove: async (key: string) => {
          delete sessionData[key];
        },
      },
    },
    runtime: {
      id: "fixture",
      getURL: (path: string) => "chrome-extension://fixture/" + path,
      onMessage: {
        addListener: (cb: Listener) => {
          listener = cb;
        },
      },
    },
    tabs: { query: async () => [] },
  });
  installServicesBackground();
  const send = (
    ids: string[],
    account = "fixtureplayer",
    tab = 1,
    op = "servicesRead",
    includeMyListings = false,
  ) =>
    new Promise<any>((resolve) => {
      const accepted = listener(
        { op, ids, account, includeMyListings, requestId: "test" },
        {
          id: "fixture",
          frameId: 0,
          url: "https://kosmora.io/collection",
          tab: { id: tab },
        },
        resolve,
      );
      expect(accepted).toBe(true);
    });
  const ids = Array.from({ length: 205 }, (_, i) => String(i + 1));
  const [result, other] = await Promise.all([
    send(ids),
    send(["42"], "someoneelse", 2),
  ]);
  expect(calls.map((call) => call.ids.length)).toEqual([100, 100, 5]);
  expect(calls.every((call) => !call.includeMyListings)).toBe(true);
  expect(listingCalls).toBe(0);
  expect(result.data["42"].card.markets.plain.median).toBe("6500000");
  expect(
    (await send(["42"], "fixtureplayer", 1, "servicesRead", true)).data["42"]
      .listings[0],
  ).toMatchObject({
    finish: "veil",
    startPrice: "8250000",
  });
  expect(other.data["42"].listings).toBeUndefined();
  await send(["42"], "fixtureplayer", 2, "servicesRead", true);
  expect(listingCalls).toBe(1);

  installServicesBackground();
  expect((await send(["42"])).data["42"].stale).toBe(false);
  expect(calls).toHaveLength(3);

  expect(
    (await send(["499"], "fixtureplayer", 1, "servicesPeek")).data["499"].card,
  ).toBeUndefined();
  await send(["501"], "fixtureplayer", 1, "servicesObserve");
  expect(calls).toHaveLength(3);
  installServicesBackground();
  expect((await send(["502"])).data["502"].card).toBeDefined();
  expect(calls[3].ids.sort()).toEqual(["501", "502"]);
  await send(Array.from({ length: 101 }, (_, index) => String(600 + index)));
  expect(calls.slice(4).map((batch) => batch.ids.length)).toEqual([100, 1]);

  for (const row of database.cards.values())
    if (row.card.id === "42" || row.card.id === "43") row.fetchedAt -= 2_000;
  freshness = 1;
  outage = true;
  installServicesBackground();
  expect((await send(["42", "43"])).data["42"]).toMatchObject({
    stale: true,
    card: { id: "42" },
  });
  await vi.waitFor(() => expect(calls).toHaveLength(7));
  expect((await send(["999"])).data["999"].card).toBeUndefined();
  expect(calls).toHaveLength(7);
  outage = false;
  database.listings.clear();
  installServicesBackground();
  const combined = await send(
    ["7001"],
    "fixtureplayer",
    1,
    "servicesRead",
    true,
  );
  expect(combined.data["7001"].listings).toHaveLength(1);
  expect(calls.at(-1)).toMatchObject({
    ids: ["7001"],
    includeMyListings: true,
    preferScopedBatch: true,
  });
  expect(listingCalls).toBe(1);

  // Another fetch fills a passively observed miss before the next dispatch.
  await send(["7002"], "fixtureplayer", 1, "servicesObserve");
  const cardKey = (id: string) =>
    JSON.stringify([database.connection.base, id]);
  const cached = database.cards.get(cardKey("7001"));
  database.cards.set(cardKey("7002"), {
    ...cached,
    key: cardKey("7002"),
    card: { ...cached.card, id: "7002" },
  });
  await send(["7003"]);
  expect(calls.at(-1)?.ids).toEqual(["7003"]);
});

it("keeps card-heavy consumers off signed-in game card routes when Services is unavailable", async () => {
  const game = vi.fn(async (path) => {
    expect(path).toBe("/api/me");
    return Response.json(me);
  });
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: async (message: { requestId: string }) => ({
        requestId: message.requestId,
        ok: true,
        data: { "42": { stale: true, until: 0 } },
      }),
    },
  });
  const client = new GameClient(game as typeof fetch);
  await client.account();
  const all = await Promise.allSettled([
    client.insights("42"),
    client.history("42", "plain"),
    client.lowestListing("42", "plain"),
    client.activeAuctions("42", "plain"),
  ]);
  expect(all.every((value) => value.status === "rejected")).toBe(true);
  expect(game).toHaveBeenCalledTimes(1);
});

it("reuses a fresh card across sequential overlay reads until expiry or a newer notification", async () => {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const send = vi.fn(async ({ requestId, ids: [id], includeMyListings }) => ({
    requestId,
    ok: true,
    data: {
      [id]: {
        card: parseServicesCard(serviceRow(id).details, id),
        stale: false,
        until: now + 300_000,
        fetchedAt: now,
        listings: includeMyListings ? [] : undefined,
      },
    },
  }));
  vi.stubGlobal("chrome", { runtime: { sendMessage: send } });
  const client = new GameClient();
  try {
    await client.insights("42");
    await client.history("42", "plain");
    expect(client.serviceCardChanged("42", now)).toBe(false);
    await client.activeAuctions("42", "plain");
    expect(send).toHaveBeenCalledTimes(1);
    expect((await client.insights("42", undefined, false, true)).onSale).toBe(
      false,
    );
    expect((await client.insights("42")).onSale).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
    now += 300_001;
    await client.history("42", "plain");
    expect(send).toHaveBeenCalledTimes(3);
    expect(client.serviceCardChanged("42", now + 1)).toBe(true);
    await client.insights("42");
    expect(send).toHaveBeenCalledTimes(4);
  } finally {
    vi.restoreAllMocks();
  }
});

it.each(["localhost", "127.0.0.1"])(
  "accepts local HTTP services on %s",
  (host) => {
    for (const port of ["", ":5214", ":65535"]) {
      const origin = `http://${host}${port}`;
      const base = servicesBase(origin + "/test/v1/");
      expect(base).toBe(origin + "/test");
      expect(servicesPermission(base)).toBe(`http://${host}/*`);
    }
  },
);

it("normalizes a scoped HTTPS URL and rejects unsafe service URLs", () => {
  expect(servicesPermission("https://services.example.com:8443/test")).toBe(
    "https://services.example.com/*",
  );
  expect(() => servicesBase("http://localhost.example.com")).toThrow();
  expect(() => servicesBase("http://127.0.0.2")).toThrow();
  expect(() => servicesBase("http://user:pass@localhost:5214")).toThrow();
  expect(servicesBase("https://services.example.com/test/v1/")).toBe(
    "https://services.example.com/test",
  );
  expect(() => servicesBase("http://services.example.com")).toThrow();
  expect(() =>
    servicesBase("https://user:pass@services.example.com"),
  ).toThrow();
  expect(() => servicesBase("https://kosmora.io")).toThrow();
});

it("extracts only validated subject and card IDs from observed responses", () => {
  expect(
    observedCardIds("/api/auctions", {
      items: [
        { id: "5555", card: { subjectId: 42 } },
        { card: { subjectId: "42" } },
        { card: { id: "77" } },
        { card: { subjectId: "00" } },
        { card: { subjectId: "8/9" } },
      ],
    }),
  ).toEqual(["42", "77"]);
});

it("checks OAuth state, binds the bearer to the base URL, and clears private data when it changes", async () => {
  type FixtureResult = {
    ok: boolean;
    error?: string;
    data?: { base: string; handle?: string };
  };
  type Listener = (
    message: unknown,
    sender: unknown,
    reply: (data: FixtureResult) => void,
  ) => boolean;
  let listener!: Listener;
  vi.stubGlobal("crypto", webcrypto);
  let state = "",
    challenge = "",
    validState = false;
  const callback = "https://fixture.chromiumapp.org/kosmore-services";
  const base = "https://test.example.com/pilot";
  const exchange = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("card-cache-config.json"))
        return Response.json({ retentionDays: 30, freshnessSeconds: 300 });
      expect(url.startsWith(base)).toBe(true);
      const data = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (url.endsWith("/connect/start")) {
        expect(data.redirectUri).toBe(callback);
        expect(data.inviteCode).toBe("tester-invite");
        state = data.state;
        challenge = data.handoffChallenge;
        return Response.json({
          authorizationUrl: "https://kosmora.io/oauth/authorize",
        });
      }
      if (url.endsWith("/connect/exchange")) {
        exchange();
        expect(data.code).toBe("handoff");
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(data.handoffVerifier),
        );
        expect(Buffer.from(digest).toString("base64url")).toBe(challenge);
        return Response.json({
          accessToken: "new-token",
          expiresAtUtc: "2099-11-25T00:00:00Z",
        });
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer new-token",
      );
      return Response.json({
        id: "000000000000000000000001",
        handle: "LinkedPlayer",
      });
    }),
  );
  const getURL = (name: string) => "chrome-extension://fixture/" + name;
  vi.stubGlobal("chrome", {
    runtime: {
      id: "fixture",
      getURL,
      onMessage: {
        addListener: (cb: Listener) => {
          listener = cb;
        },
      },
    },
    storage: { local: { set: async () => {} } },
    permissions: { contains: async () => true },
    identity: {
      getRedirectURL: () => callback,
      launchWebAuthFlow: async () =>
        callback + "?code=handoff&state=" + (validState ? state : "wrong"),
    },
    tabs: { query: async () => [] },
  });
  const previous = database.connection;
  try {
    installServicesBackground();
    const send = (op: string, base?: string) =>
      new Promise<FixtureResult>((resolve) =>
        listener(
          { op, base, inviteCode: "tester-invite", requestId: "test" },
          { id: "fixture", url: getURL("options.html") },
          resolve,
        ),
      );
    expect(await send("servicesConnect", base)).toMatchObject({
      ok: false,
      error: expect.stringContaining("callback"),
    });
    expect(exchange).not.toHaveBeenCalled();
    validState = true;
    expect(await send("servicesConnect", base)).toMatchObject({
      ok: true,
      data: { base, handle: "LinkedPlayer" },
    });
    database.listings.set("private", { fetchedAt: Date.now() });
    const next = "https://test.example.com/other";
    expect(await send("servicesSave", next)).toEqual({
      requestId: "test",
      ok: true,
      data: { base: next },
    });
    expect(database.connection.session).toBeUndefined();
    expect(database.listings.size).toBe(0);
  } finally {
    database.connection = previous;
  }
});