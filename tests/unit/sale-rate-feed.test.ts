import { expect, it, vi } from "vitest";
import { installPageRelay } from "../../src/page-relay-install";
import { parseObservedAuctions } from "../../src/kosmora/auctions";
import {
  HistoryResolver,
  listenToPageRelay,
} from "../../src/content/sale-rate-feed";
import { SaleObservationStore } from "../../src/content/sale-observation-store";
import {
  isRelayMessage,
  RELAY_DATA,
  RELAY_READY,
  RELAY_LISTED,
} from "../../src/shared/page-relay";
import type { Finish, MarketHistory } from "../../src/shared/types";
import {
  RELAY_SALE_BATCH,
  saleSelectionKeys,
} from "../../src/shared/sale-family-selection";
import { auction } from "../fixtures/auctions";

const ORIGIN = "https://kosmora.io";
type Listener = (event: {
  source: unknown;
  origin?: string;
  data: unknown;
}) => void;
function fakeWindow(fetchImpl: typeof fetch = vi.fn()) {
  const listeners: Listener[] = [];
  const win = {
    fetch: fetchImpl,
    location: { origin: ORIGIN, href: `${ORIGIN}/market` },
    postMessage: vi.fn(),
    addEventListener: (_type: string, fn: Listener) => listeners.push(fn),
  };
  const dispatch = (data: unknown, source: unknown = win, origin = ORIGIN) =>
    listeners.forEach((fn) => fn({ source, origin, data }));
  return { win: win as unknown as Window & typeof win, dispatch };
}
const json = (data: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(data), { status }));
const flush = () => new Promise((r) => setTimeout(r, 0));

it("relays copies of the game's own auction GETs only, buffering until the content script is ready", async () => {
  const page = { items: [auction(1)], nextOffset: null };
  const original = vi.fn((input: RequestInfo | URL) =>
    String(input).includes("/api/auctions") ? json(page) : json({}),
  );
  const { win, dispatch } = fakeWindow(original as unknown as typeof fetch);
  installPageRelay(win);
  installPageRelay(win); // idempotent
  const response = await win.fetch("/api/auctions?sort=ending&offset=0");
  expect(await response.json()).toEqual(page); // page still reads its body
  await win.fetch("/api/collection");
  await win.fetch("/api/auctions", { method: "POST" });
  await win.fetch("https://evil.example/api/auctions");
  await win.fetch(new Request(`${ORIGIN}/api/auctions/${auction(2).id}`));
  await flush();
  expect(win.postMessage).not.toHaveBeenCalled();
  dispatch({ type: RELAY_READY }, {}); // not from the page window: ignored
  expect(win.postMessage).not.toHaveBeenCalled();
  dispatch({ type: RELAY_READY });
  await vi.waitFor(() => expect(win.postMessage).toHaveBeenCalledTimes(2));
  expect(win.postMessage.mock.calls.map(([m]) => m.path)).toEqual([
    "/api/auctions",
    `/api/auctions/${auction(2).id}`,
  ]);
  expect(win.postMessage.mock.calls[0]).toEqual([
    { type: RELAY_DATA, path: "/api/auctions", data: page },
    ORIGIN,
  ]);
  expect(original).toHaveBeenCalledTimes(5);
});

it("pauses native auction relay without consuming the game's response", async () => {
  const data = { items: [auction(1)], nextOffset: null };
  const response = new Response(JSON.stringify(data));
  const clone = vi.spyOn(response, "clone");
  const original = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(data)))
    .mockResolvedValueOnce(response)
    .mockImplementation(() => json(data));
  const { win, dispatch } = fakeWindow(original);
  installPageRelay(win);
  await win.fetch("/api/auctions?offset=0");
  dispatch({ type: RELAY_READY, preferences: { collectSaleRateData: false } });
  expect(await (await win.fetch("/api/auctions?offset=1")).json()).toEqual(
    data,
  );
  await flush();
  expect(clone).not.toHaveBeenCalled();
  expect(win.postMessage).not.toHaveBeenCalled();
  dispatch({ type: RELAY_READY, preferences: { collectSaleRateData: true } });
  await win.fetch("/api/auctions?offset=2");
  await vi.waitFor(() => expect(win.postMessage).toHaveBeenCalledOnce());
});

it("never relays failed responses and never breaks the page's request", async () => {
  const { win, dispatch } = fakeWindow(
    vi.fn(() => json({ code: "rate_limited" }, 429)) as unknown as typeof fetch,
  );
  installPageRelay(win);
  dispatch({ type: RELAY_READY });
  expect((await win.fetch("/api/auctions")).status).toBe(429);
  await flush();
  expect(win.postMessage).not.toHaveBeenCalled();
});

it("invalidates personal prices only after successful single or batch listings, never quotes or failures", async () => {
  const original = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    return new Response(
      JSON.stringify(
        path.includes("batch") ? { listed: 1 } : { auctionId: auction(1).id },
      ),
      { status: path.includes("failed") ? 503 : 200 },
    );
  });
  const { win, dispatch } = fakeWindow(original as typeof fetch);
  installPageRelay(win);
  dispatch({ type: RELAY_READY });
  await win.fetch("/api/auctions", { method: "POST" });
  await win.fetch("/api/market/listings/batch", { method: "POST" });
  await win.fetch("/api/auctions/quote", { method: "POST" });
  await win.fetch("/api/collection", { method: "POST" });
  await win.fetch("https://evil.example/api/auctions", { method: "POST" });
  await flush();
  expect(win.postMessage.mock.calls.map(([message]) => message)).toEqual([
    {
      type: RELAY_LISTED,
      path: "/api/auctions",
      listings: [expect.objectContaining({ auctionId: auction(1).id })],
    },
    { type: RELAY_LISTED, path: "/api/market/listings/batch", listings: [] },
  ]);
  expect(original).toHaveBeenCalledTimes(5);
  const failed = fakeWindow(
    vi.fn(() => json({}, 503)) as unknown as typeof fetch,
  );
  installPageRelay(failed.win);
  failed.dispatch({ type: RELAY_READY });
  await failed.win.fetch("/api/auctions", { method: "POST" });
  await flush();
  expect(failed.win.postMessage).not.toHaveBeenCalled();
});

it("relays only selection identities for native batch reads and draft updates", async () => {
  const item = {
    subjectId: "42",
    key: "42.v",
    instanceId: "copy",
    card: {},
    rarity: "Common",
    suggestion: { start: "secret-price" },
  };
  const response = { items: [item, { block: "unavailable", subjectId: "99" }] };
  const { win, dispatch } = fakeWindow(
    vi.fn(() => json(response)) as unknown as typeof fetch,
  );
  Object.assign(win.location, {
    pathname: "/market/sell/batch",
    href: `${ORIGIN}/market/sell/batch?s=42.v`,
  });
  installPageRelay(win);
  const res = await win.fetch("/api/market/listings/batch?subjects=42.v");
  expect(await res.json()).toEqual(response);
  await flush();
  dispatch({ type: RELAY_READY });
  expect(win.postMessage.mock.calls[0][0]).toEqual({
    type: RELAY_SALE_BATCH,
    source: "batch",
    page: win.location.href,
    revision: 1,
    keys: ["42.v"],
  });
  await win.fetch("/api/market/sell-draft", {
    method: "PUT",
    body: JSON.stringify({
      items: [
        {
          subjectId: "42",
          fullArt: true,
          start: "secret-price",
          copy: "private-copy",
        },
      ],
    }),
  });
  await flush();
  expect(win.postMessage.mock.calls[1][0]).toMatchObject({
    source: "draft",
    revision: 2,
    keys: ["42.f"],
  });
  expect(JSON.stringify(win.postMessage.mock.calls)).not.toContain(
    "secret-price",
  );
  expect(JSON.stringify(win.postMessage.mock.calls)).not.toContain(
    "private-copy",
  );
  await win.fetch("https://evil.example/api/market/listings/batch");
  Object.assign(win.location, { pathname: "/market" });
  await win.fetch("/api/market/listings/batch");
  await flush();
  expect(win.postMessage).toHaveBeenCalledTimes(2);
  expect(
    saleSelectionKeys({ items: [item, { subjectId: "bad" }] }, "batch"),
  ).toBeUndefined();
});

it("observes Request draft bodies without consuming the native request", async () => {
  const original = vi.fn(async (input: RequestInfo | URL) => {
    if (input instanceof Request)
      expect(await input.json()).toMatchObject({
        items: [{ subjectId: "42" }],
      });
    return new Response("{}");
  });
  const { win, dispatch } = fakeWindow(original as typeof fetch);
  Object.assign(win.location, {
    pathname: "/market/sell/batch",
    href: `${ORIGIN}/market/sell/batch`,
  });
  installPageRelay(win);
  dispatch({ type: RELAY_READY });
  await win.fetch(
    new Request(`${ORIGIN}/api/market/sell-draft`, {
      method: "PUT",
      body: JSON.stringify({ items: [{ subjectId: "42", start: "17" }] }),
    }),
  );
  await flush();
  expect(win.postMessage.mock.calls[0][0]).toMatchObject({
    source: "draft",
    keys: ["42"],
  });
  expect(original).toHaveBeenCalledTimes(1);
});

it("validates relay messages by type and allow-listed path", () => {
  expect(
    isRelayMessage({ type: RELAY_DATA, path: "/api/auctions", data: {} }),
  ).toBe(true);
  for (const bad of [
    null,
    { type: RELAY_DATA, path: "/api/collection", data: {} },
    { type: "other", path: "/api/auctions", data: {} },
    { type: RELAY_DATA, path: "/api/auctions" },
  ])
    expect(isRelayMessage(bad)).toBe(false);
});

it("reads open and finished listings with their finish, skipping malformed and withdrawn ones", () => {
  const ends = new Date(Date.now() - 1000).toISOString();
  const result = parseObservedAuctions({
    items: [
      auction(1),
      auction(2, "42", { state: "sold", endsAt: ends, veil: true }),
      auction(3, "42", { state: "expired", endsAt: ends }),
      auction(4, "42", { state: "settled", finalPrice: "5000000" }),
      auction(5, "42", { state: "cancelled" }),
      auction(6, "42", { veil: true, fullArt: true }),
      { id: "broken" },
    ],
  });
  expect(result.map((a) => [a.id.slice(-1), a.outcome, a.finish])).toEqual([
    ["1", "open", "plain"],
    ["2", "sold", "veil"],
    ["3", "unsold", "plain"],
    ["4", "sold", "plain"],
    ["6", "open", "fullart"],
  ]);
  expect(parseObservedAuctions(auction(7))).toHaveLength(1);
  expect(parseObservedAuctions("nope")).toEqual([]);
});

it("records relayed listings in the content script and announces readiness", () => {
  const store = new SaleObservationStore(undefined);
  const { win, dispatch } = fakeWindow();
  listenToPageRelay(store, win);
  expect(win.postMessage).toHaveBeenCalledWith({ type: RELAY_READY }, ORIGIN);
  const data = { items: [auction(1), auction(2, "43")] };
  dispatch({ type: RELAY_DATA, path: "/api/auctions", data }, {});
  dispatch({ type: RELAY_DATA, path: "/api/auctions", data }, win, "https://x");
  dispatch({ type: RELAY_DATA, path: "/api/me", data });
  expect(store.observations.size).toBe(0);
  dispatch({ type: RELAY_DATA, path: "/api/auctions", data });
  expect([...store.observations.values()].map((o) => o.subjectId)).toEqual([
    "42",
    "43",
  ]);
  expect(store.observations.get(auction(1).id)!.outcome).toBe("open");
});

const history = (finish: Finish, auctionIds: string[] = []): MarketHistory => ({
  finish,
  days: 30,
  count: auctionIds.length,
  low: null,
  median: null,
  high: null,
  sales: auctionIds.map((auctionId) => ({
    auctionId,
    price: "1000000",
    soldAt: new Date().toISOString(),
    finish,
  })),
  complete: true,
});

it("settles listings from network histories using their fetch time", () => {
  const store = new SaleObservationStore(undefined);
  const ended = Date.parse("2026-11-05T10:00:00Z");
  store.record(auction(1).id, {
    subjectId: "42",
    finish: "plain",
    outcome: "open",
    endsAt: ended,
  });
  store.record(auction(2).id, {
    subjectId: "42",
    finish: "veil",
    outcome: "open",
    endsAt: ended,
  });
  const changed = vi.spyOn(store, "resolved");
  const resolver = new HistoryResolver(store);
  // Fetched before the listings ended: proves nothing.
  resolver.receive("42", history("plain"), ended - 60_000);
  expect(changed).not.toHaveBeenCalled();
  const later = ended + 30 * 60_000;
  resolver.receive("42", history("plain", [auction(2).id]), later);
  expect(store.observations.get(auction(1).id)!.outcome).toBe("unsold");
  expect(store.observations.get(auction(2).id)!.outcome).toBe("sold");
  expect(changed).toHaveBeenCalledTimes(1);
});
