import {
  test,
  expect,
  type BrowserContext,
  type Worker,
} from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launchTestBrowser } from "./browser";
import { singleSellFixture, sellManyFixture } from "../fixtures/sell-many";
import { me } from "../fixtures/data";
import { myListing, myListingPage } from "../fixtures/my-listings";
import type { RecordedListing } from "../../src/kosmora/listing-capture";

test("two profiles sync confirmed prices, survive offline restart and respect erasure", async () => {
  test.setTimeout(90_000);
  const rows = new Map<string, RecordedListing>();
  let generation = 0,
    erasedAt = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") {
      res.end();
      return;
    }
    const url = new URL(req.url!, "http://localhost");
    if (req.method === "DELETE") {
      rows.clear();
      generation++;
      erasedAt = Date.now();
      res.end(JSON.stringify({ generation, erasedAt }));
      return;
    }
    if (req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const batch = JSON.parse(body);
      if (batch.generation !== generation) {
        res.writeHead(409);
        res.end();
        return;
      }
      for (const r of batch.records)
        if (r.submittedAt > erasedAt && !rows.has(r.id)) rows.set(r.id, r);
      res.writeHead(204);
      res.end();
      return;
    }
    const cursor =
      Number(url.searchParams.get("generation")) === generation
        ? Number(url.searchParams.get("after"))
        : 0;
    res.end(
      JSON.stringify({
        generation,
        erasedAt,
        cursor: rows.size,
        hasMore: false,
        records: [...rows.values()].slice(cursor),
      }),
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  const profiles: string[] = [];
  const contexts = new Set<BrowserContext>();
  const auction = "10000000-0000-4000-8000-000000000001";
  const copy = "20000000-0000-4000-8000-000000000001";
  const bundle = resolve(process.env.KOSMORE_TEST_BUNDLE ?? "dist");

  async function open(existing?: string) {
    const profile =
      existing ?? (await mkdtemp(resolve(tmpdir(), "kosmore-history-")));
    if (!existing) profiles.push(profile);
    const context = await launchTestBrowser(profile, {
      channel: "chromium",
      headless: true,
      args: [
        "--disable-extensions-except=" + bundle,
        "--load-extension=" + bundle,
      ],
    });
    contexts.add(context);
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const calls: string[] = [];
    await context.route("https://kosmora.io/**", (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/"))
        return route.fulfill({
          contentType: "text/html",
          body: url.pathname.endsWith("/batch")
            ? sellManyFixture(true)
            : singleSellFixture(),
        });
      calls.push(url.pathname);
      if (url.pathname === "/api/me") return route.fulfill({ json: me });
      if (url.pathname === "/api/me/auctions")
        return route.fulfill({
          json: myListingPage([
            myListing(1, "42", { id: auction, startPrice: "8250000" }),
          ]),
        });
      if (url.pathname === "/api/auctions")
        return route.fulfill({
          json: { auctionId: auction, instanceId: copy },
        });
      if (url.pathname === "/api/market/listings/batch")
        return route.fulfill({
          json: {
            results: [
              {
                ok: true,
                auctionId: "10000000-0000-4000-8000-000000000002",
                instanceId: copy,
              },
              {
                ok: false,
                auctionId: "10000000-0000-4000-8000-000000000003",
                instanceId: "20000000-0000-4000-8000-000000000003",
              },
            ],
          },
        });
      return route.fulfill({ json: {} });
    });
    await worker.evaluate(
      async ({ port, existing }) => {
        const service = "https://services.example.com";
        const state = { oauth: "", offline: false, requests: 0 };
        Object.assign(globalThis, { historyFixture: state });
        chrome.permissions.contains = async () => true;
        chrome.identity.launchWebAuthFlow = async () =>
          chrome.identity.getRedirectURL("kosmore-services") +
          "?code=ok&state=" +
          state.oauth;
        const original = fetch;
        globalThis.fetch = async (input, init) => {
          const url = String(input);
          if (!url.startsWith(service)) return original(input, init);
          const route = url.slice(service.length);
          if (route === "/v1/connect/start") {
            state.oauth = JSON.parse(String(init?.body)).state;
            return Response.json({
              authorizationUrl: "https://kosmora.io/oauth/authorize",
            });
          }
          if (route === "/v1/connect/exchange")
            return Response.json({
              accessToken: "fixture",
              expiresAtUtc: "2099-01-01",
              scopes: ["identity", "listings"],
            });
          if (route === "/v1/me")
            return Response.json({
              id: "000000000000000000000001",
              handle: "FixturePlayer",
            });
          state.requests++;
          if (state.offline) throw new Error("Fixture offline");
          if (!route.startsWith("/v1/me/listing-history"))
            throw new Error("Unexpected request " + route);
          return original("http://127.0.0.1:" + port + route, {
            method: init?.method,
            ...(init?.body && {
              body: init.body,
              headers: { "Content-Type": "application/json" },
            }),
          });
        };
        if (!existing)
          await chrome.storage.local.set({
            "kosmore.settings": {
              schemaVersion: 1,
              enabled: false,
              cardOverlaysEnabled: false,
              familyImpactOverlaysEnabled: false,
              showSalesLastSale: false,
              showSalesLowestListing: false,
              salesDiscountEnabled: false,
              showSalesMyLastListing: true,
              pinnedAlbumsEnabled: false,
              showFriendInterestOverlay: false,
              showOnSaleOverlay: false,
            },
          });
      },
      { port, existing: !!existing },
    );
    const options = await context.newPage();
    await options.goto(
      "chrome-extension://" +
        new URL(worker.url()).host +
        "/options.html#connected-account",
    );
    if (!existing) {
      await options.evaluate(() => {
        chrome.permissions.request = async () => true;
      });
      const field = options.getByLabel("KosMore Services API base URL");
      await field.fill("https://services.example.com");
      await field.blur();
      await options
        .getByRole("button", { name: "Connect", exact: true })
        .click();
    }
    await expect(options.getByText("Linked to FixturePlayer.")).toBeVisible();
    return { context, worker, profile, options, calls };
  }
  const requestCount = (worker: Worker) =>
    worker.evaluate(
      () => (globalThis as any).historyFixture.requests as number,
    );
  const tick = (worker: Worker) =>
    worker.evaluate(() =>
      chrome.alarms.create("kosmore.listing-history", {
        when: Date.now() + 100,
        periodInMinutes: 5,
      }),
    );
  try {
    let a = await open();
    await a.worker.evaluate(async () => {
      await chrome.storage.local.set({
        "kosmore.listingRecord.fixtureplayer.42": {
          v: 2,
          listings: [
            {
              id: "30000000-0000-4000-8000-000000000001",
              startPrice: "4000000",
              submittedAt: Date.now() - 3600000,
            },
            {
              id: "30000000-0000-4000-8000-000000000002",
              startPrice: "99000000",
              endsAt: "2099-01-01",
            },
          ],
        },
        "kosmore.listingRecord.someoneelse.42": {
          v: 2,
          listings: [
            {
              id: "30000000-0000-4000-8000-000000000003",
              startPrice: "5000000",
              submittedAt: Date.now(),
            },
          ],
        },
      });
    });
    const first = await a.context.newPage();
    await first.goto("https://kosmora.io/market/sell");
    await expect(
      first.getByRole("button", { name: "Verify account" }),
    ).toBeVisible();
    expect(a.calls).toEqual([]);
    await first.getByRole("button", { name: "Verify account" }).click();
    await expect(first.getByText("My Last Listing: $4")).toBeVisible();
    await a.worker.evaluate(() => {
      (globalThis as any).historyFixture.offline = true;
    });
    await first.evaluate(async (copy) => {
      await fetch("/api/auctions", {
        method: "POST",
        body: JSON.stringify({
          instanceId: copy,
          subjectId: "42",
          startPrice: "8250000",
        }),
      });
    }, copy);
    await expect(first.getByText("My Last Listing: $8.25")).toBeVisible();
    expect(rows.size).toBe(0);
    await a.context.close();
    contexts.delete(a.context);
    a = await open(a.profile);
    const gameA = await a.context.newPage();
    await gameA.goto("https://kosmora.io/market/sell");
    await tick(a.worker);
    await expect.poll(() => rows.size).toBe(2);
    expect([...rows.values()].map((r) => r.startPrice).sort()).toEqual([
      "4000000",
      "8250000",
    ]);
    const b = await open();
    const gameB = await b.context.newPage();
    await expect.poll(() => requestCount(b.worker)).toBeGreaterThan(0);
    const counts = await requestCount(b.worker);
    await gameB.goto("https://kosmora.io/market/sell/batch");
    await expect(
      gameB.getByRole("button", { name: "Verify account" }).first(),
    ).toBeVisible();
    expect(b.calls).toEqual([]);
    expect(await requestCount(b.worker)).toBe(counts);
    await gameB.getByRole("button", { name: "Verify account" }).first().click();
    await expect(gameB.getByText("My Last Listing: $8.25")).toBeVisible();
    const native = [...b.calls];
    await gameB.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect(b.calls).toEqual(native);
    expect(await requestCount(b.worker)).toBe(counts);
    // The game now shows the original auction as expired. The captured starting price survives.
    await gameB.evaluate(async () => {
      await fetch("/api/me/auctions").then((r) => r.json());
    });
    await expect(gameB.getByText("My Last Listing: $8.25")).toBeVisible();
    // Leave B offline with a newer pending submission, then erase on A.
    await b.worker.evaluate(() => {
      (globalThis as any).historyFixture.offline = true;
    });
    await gameB.evaluate(async (copy) => {
      await fetch("/api/market/listings/batch", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { instanceId: copy, subjectId: "42", startPrice: "9500000" },
            {
              instanceId: "20000000-0000-4000-8000-000000000003",
              subjectId: "46",
              startPrice: "2000000",
            },
          ],
        }),
      });
    }, copy);
    await expect(gameB.getByText("My Last Listing: $9.5")).toBeVisible();
    await expect(gameB.getByText(/No recorded listing/)).toBeVisible();
    a.options.once("dialog", (d) => d.accept());
    await a.options
      .getByRole("button", { name: "Erase synced listing history" })
      .click();
    await expect(
      a.options.getByText(/Synced listing history erased/),
    ).toBeVisible();
    expect(rows.size).toBe(0);
    await b.worker.evaluate(() => {
      (globalThis as any).historyFixture.offline = false;
    });
    await tick(b.worker);
    await expect(gameB.getByText("My Last Listing: $9.5")).toHaveCount(0);
    await expect(gameB.getByText(/No recorded listing/)).toHaveCount(2);
    expect(rows.size).toBe(0);
  } finally {
    for (const ctx of contexts) await ctx.close();
    await Promise.all(
      profiles.map((p) => rm(p, { recursive: true, force: true })),
    );
    server.closeAllConnections();
    server.close();
  }
});
