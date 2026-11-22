import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launchTestBrowser } from "./browser";
import { albums, face, me } from "../fixtures/data";
import { singleSellFixture } from "../fixtures/sell-many";
import { serviceRow } from "../fixtures/services";

test("uses the unified Services response on a cold cache, then reuses it across tabs", async () => {
  const profile = await mkdtemp(resolve(tmpdir(), "kosmore-services-"));
  const bundle = resolve(process.env.KOSMORE_TEST_BUNDLE ?? "dist");
  const context = await launchTestBrowser(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${bundle}`,
      `--load-extension=${bundle}`,
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const extension = new URL(worker.url()).hostname;
    const service = "https://services.example.com/test";
    const paths: string[] = [];
    let gameHandle = me.handle;
    await context.route("https://kosmora.io/**", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith("/api/")) {
        if (url.pathname.startsWith("/media/"))
          return route.fulfill({ status: 204 });
        if (url.searchParams.has("scrollGrid"))
          return route.fulfill({
            contentType: "text/html",
            body: `<style>main{display:grid;grid-template-columns:repeat(4,1fr)}article{height:150px}</style><main>${Array.from({ length: 200 }, (_, i) => face(String(1001 + i))).join("")}</main>`,
          });
        const sell = url.pathname === "/market/sell";
        const id = url.searchParams.get("card") ?? "42";
        return route.fulfill({
          contentType: "text/html",
          body: sell
            ? singleSellFixture()
            : `<main><a href="/card/${id}">${face(id)}</a></main>`,
        });
      }
      paths.push(url.pathname + url.search);
      if (url.pathname === "/api/me")
        return route.fulfill({ json: { ...me, handle: gameHandle } });
      if (url.pathname === "/api/albums")
        return route.fulfill({ json: albums(false) });
      if (
        url.pathname === "/api/collection" &&
        url.searchParams.has("native")
      ) {
        return route.fulfill({
          json: {
            items: [{ card: { subjectId: "42" } }],
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    const row = serviceRow("42");
    row.details.history.plain.unshift(
      {
        day: "2026-11-17",
        count: 3,
        low: "3000000",
        median: "4000000",
        high: "9000000",
      },
      { day: "2026-11-18", count: 0, low: "0", median: "0", high: "0" },
    );
    row.details.sales.plain.last30Days.count += 3;
    await worker.evaluate(
      async ({ service, row }) => {
        await chrome.storage.local.set({
          "kosmore.settings": {
            schemaVersion: 1,
            showOnSaleOverlay: false,
            showFriendInterestOverlay: false,
            pinnedAlbumsEnabled: false,
          },
          "kosmore.cardNotes.fixtureplayer.42": {
            schemaVersion: 1,
            text: "Only FixturePlayer can see this note",
          },
        });
        const original = globalThis.fetch;
        const state = {
          value: "",
          blocked: false,
          listingCalls: 0,
          batches: [] as { ids: string[]; includeMyListings: boolean }[],
        };
        Object.assign(globalThis, { servicesFixture: state });
        chrome.permissions.contains = async () => true;
        chrome.identity.launchWebAuthFlow = async () =>
          chrome.identity.getRedirectURL("kosmore-services") +
          "?code=test&state=" +
          state.value;
        globalThis.fetch = async (input, init) => {
          if (!String(input).startsWith(service)) return original(input, init);
          const route = String(input).slice(service.length);
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          if (route === "/v1/connect/start") {
            if (body.inviteCode !== "fixture-invite")
              return Response.json(
                { error: "invite_unavailable" },
                { status: 400 },
              );
            state.value = body.state;
            return Response.json({
              authorizationUrl: "https://kosmora.io/oauth/authorize",
            });
          }
          if (route === "/v1/connect/exchange")
            return Response.json({
              accessToken: "fixture",
              expiresAtUtc: "2099-11-25T00:00:00Z",
            });
          if (route === "/v1/me")
            return Response.json({
              id: "000000000000000000000001",
              handle: "FixturePlayer",
            });
          if (route.startsWith("/v1/me/listing-history/changes"))
            return Response.json({
              generation: 0,
              erasedAt: 0,
              cursor: 1,
              hasMore: false,
              records: [
                {
                  id: "10000000-0000-4000-8000-000000000001",
                  subjectId: "42",
                  startPrice: "8250000",
                  submittedAt: Date.now() - 1000,
                },
              ],
            });
          if (route === "/v1/me/listings") {
            state.listingCalls++;
            return Response.json({ auctions: row.myListings });
          }
          if (route === "/v1/cards/details") {
            state.batches.push(body);
            if (state.blocked) return new Response(null, { status: 403 });
            const now = Date.now();
            return Response.json({
              myListingsStatus: "fresh",
              cards: body.ids.map((id: string) => ({
                ...row,
                id,
                details: { ...row.details, card: { ...row.details.card, id } },
                fetchedAtUtc: new Date(now).toISOString(),
                freshUntilUtc: new Date(now + 300_000).toISOString(),
                myListings: row.myListings.map((listing) => ({
                  ...listing,
                  card: { id },
                })),
              })),
            });
          }
          throw new Error("Unexpected Services route " + route);
        };
      },
      { service, row },
    );

    const options = await context.newPage();
    await options.goto(
      `chrome-extension://${extension}/options.html#connected-account`,
    );
    const url = options.getByLabel("KosMore Services API base URL");
    await expect(url).toHaveValue("");
    await expect(
      options.getByRole("button", { name: "Connect", exact: true }),
    ).toBeDisabled();
    await url.fill(service);
    await url.blur();
    await options.evaluate(() => {
      chrome.permissions.request = async () => true;
    });
    await options.getByLabel("Tester invite code").fill("invalid-code");
    await options.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(options.getByText(/This invite is unavailable/)).toBeVisible();
    await options.getByLabel("Tester invite code").fill("fixture-invite");
    await options.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(options.getByText("Linked to FixturePlayer.")).toBeVisible();

    const cards = await context.newPage();
    await cards.goto("https://kosmora.io/collection");
    await cards.evaluate(() =>
      fetch("/api/collection?native=1").then((response) => response.json()),
    );
    await cards.locator('main a[href="/card/42"]').hover();
    await expect(cards.getByText("Last Sale:")).toBeVisible();
    await expect(
      cards.getByRole("dialog").getByText("Last Sale: $6.50", { exact: true }),
    ).toBeVisible();
    const daily = cards.getByRole("table", {
      name: "Daily sale prices by variant in Kosmo",
    });
    await expect(daily.locator("tbody tr")).toHaveCount(2);
    await expect(daily.locator("time").first()).toHaveAttribute(
      "datetime",
      "2026-11-20",
    );
    await expect(daily.locator("time").last()).toHaveAttribute(
      "datetime",
      "2026-11-17",
    );
    await expect(daily.locator("tbody tr").last().locator("td")).toHaveText([
      "Standard",
      "3",
      "4",
      "9",
    ]);
    expect(paths).toEqual(["/api/collection?native=1"]);
    expect(
      await worker.evaluate(
        () => (globalThis as any).servicesFixture.listingCalls,
      ),
    ).toBe(0);
    const sales = await context.newPage();
    await sales.goto("https://kosmora.io/market/sell");
    await expect(
      sales.getByRole("button", { name: "Verify account" }),
    ).toBeVisible();
    expect(paths).toEqual(["/api/collection?native=1"]);
    await sales.getByRole("button", { name: "Verify account" }).click();
    await expect(
      sales.getByText("My Last Listing:", { exact: false }).first(),
    ).toContainText("$8.25");
    const batches = await worker.evaluate(
      () =>
        (
          globalThis as typeof globalThis & {
            servicesFixture: { batches: unknown[] };
          }
        ).servicesFixture.batches,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual({ ids: ["42"], includeMyListings: false });
    expect(
      await worker.evaluate(
        () => (globalThis as any).servicesFixture.listingCalls,
      ),
    ).toBe(0);
    expect(
      paths.filter((path) =>
        /\/api\/(?:collection|cards|auctions|me\/auctions)/.test(path),
      ),
    ).toEqual(["/api/collection?native=1"]);
    const gameAccountPage = await context.newPage();
    await gameAccountPage.goto("https://kosmora.io/account");
    await cards.bringToFront();
    await cards.locator('main a[href="/card/42"]').hover();
    await cards.getByRole("tab", { name: "Notes" }).click();
    await expect(cards.getByLabel("Card notes")).toHaveValue(
      "Only FixturePlayer can see this note",
    );
    gameHandle = "OtherPlayer";
    await gameAccountPage.evaluate(() =>
      fetch("/api/me").then((r) => r.json()),
    );
    await expect(cards.getByLabel("Card notes")).toHaveCount(0);
    await cards.locator('main a[href="/card/42"]').hover();
    await expect(
      cards.getByRole("dialog").getByText("Last Sale: $6.50", { exact: true }),
    ).toBeVisible();
    await cards.getByRole("tab", { name: "Notes" }).click();
    await expect(cards.getByLabel("Card notes")).toHaveValue("");
    await cards.getByRole("tab", { name: "My listing history" }).click();
    await expect(
      cards.getByText(/No saved or open single-card listings/),
    ).toBeVisible();
    await expect(cards.getByText("$8.25", { exact: true })).toHaveCount(0);
    await expect(
      cards.getByRole("button", { name: "Sell card" }),
    ).toBeDisabled();
    await worker.evaluate(() => {
      (globalThis as any).servicesFixture.blocked = true;
    });
    await cards.goto("https://kosmora.io/collection?card=77");
    await cards.locator('main a[href="/card/77"]').hover();
    await expect(
      options.getByRole("button", { name: "Retry access" }),
    ).toBeVisible();
    const blockedCalls = await worker.evaluate(
      () => (globalThis as any).servicesFixture.batches.length,
    );
    await cards.goto("https://kosmora.io/collection?card=78");
    await cards.locator('main a[href="/card/78"]').hover();
    await expect(
      cards.getByText(/Services access is blocked/).first(),
    ).toBeVisible();
    expect(
      await worker.evaluate(
        () => (globalThis as any).servicesFixture.batches.length,
      ),
    ).toBe(blockedCalls);
    await worker.evaluate(() => {
      (globalThis as any).servicesFixture.blocked = false;
    });
    await options.getByRole("button", { name: "Retry access" }).click();
    await expect(options.getByText("Linked to FixturePlayer.")).toBeVisible();

    await worker.evaluate(async () => {
      const key = "kosmore.settings";
      const saved = await chrome.storage.local.get(key);
      await chrome.storage.local.set({
        [key]: { ...(saved[key] as object), showOnSaleOverlay: true },
      });
    });
    gameHandle = me.handle;
    const grid = await context.newPage();
    await grid.goto("https://kosmora.io/collection?scrollGrid=1");
    const tiles = grid.locator("main article");
    const first = tiles.first().locator(".signal-badge.auction");
    await expect(first).toBeVisible();
    const originalBadge = await first.elementHandle();
    for (const index of [50, 100, 150, 199, 100, 50, 0]) {
      const tile = tiles.nth(index);
      await tile.scrollIntoViewIfNeeded();
      await expect(tile.locator(".signal-badge.auction")).toBeVisible();
    }
    expect(
      await first.evaluate(
        (badge, original) => badge === original,
        originalBadge,
      ),
    ).toBe(true);
    const gridBatches: string[][] = await worker.evaluate(() =>
      (globalThis as any).servicesFixture.batches
        .map((batch: { ids: string[] }) => batch.ids)
        .filter((ids: string[]) => ids.some((id) => Number(id) >= 1001)),
    );
    expect(gridBatches.map((ids) => ids.length)).toEqual([100, 100]);
    expect(new Set(gridBatches.flat()).size).toBe(200);
    const totals = () =>
      worker.evaluate(() => {
        const fixture = (globalThis as any).servicesFixture;
        return [fixture.batches.length, fixture.listingCalls];
      });
    const warm = await totals();
    await grid.reload();
    await expect(first).toBeVisible();
    await tiles.last().scrollIntoViewIfNeeded();
    await expect(tiles.last().locator(".signal-badge.auction")).toBeVisible();
    expect(await totals()).toEqual(warm);

    // A price update from another tab must still reach this grid while its
    // adjacent card keeps the same clickable badge.
    await tiles.first().scrollIntoViewIfNeeded();
    const neighbor = await first.elementHandle();
    const updated = tiles.nth(1).locator(".signal-badge.auction .badge-price");
    await expect(updated).toHaveText("$7.5");
    await worker.evaluate(async (base) => {
      const id = "1002";
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("kosmore.services");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("cards", "readwrite");
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
          const store = tx.objectStore("cards");
          const get = store.get(JSON.stringify([base, id]));
          get.onsuccess = () => {
            const row = get.result;
            row.card.auctions[0].price = "12000000";
            store.put(row);
          };
        });
      } finally {
        db.close();
      }
      const [tab] = await chrome.tabs.query({
        url: "https://kosmora.io/collection?scrollGrid=1",
      });
      await chrome.tabs.sendMessage(tab.id!, {
        op: "servicesCardsChanged",
        ids: [id],
      });
    }, service);
    await expect(updated).toHaveText("$12");
    expect(
      await first.evaluate((badge, original) => badge === original, neighbor),
    ).toBe(true);
    expect(await totals()).toEqual(warm);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
