import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launchTestBrowser } from "./browser";
import { card, COPY_A, COPY_B, face, me } from "../fixtures/data";
import { auction } from "../fixtures/auctions";
import { myListing, myListingPage } from "../fixtures/my-listings";

test("confirmed changes update album and collection labels across tabs", async () => {
  const profile = await mkdtemp(resolve(tmpdir(), "kosmore-for-sale-"));
  const bundle = resolve("dist");
  const context = await launchTestBrowser(profile, {
    channel: "chromium",
    headless: true,
    args: [
      "--disable-extensions-except=" + bundle,
      "--load-extension=" + bundle,
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await worker.evaluate(() =>
      chrome.storage.local.set({
        "kosmore.settings": {
          schemaVersion: 1,
          enabled: false,
          salesOverlaysEnabled: false,
          cardOverlaysEnabled: true,
          showOnSaleOverlay: true,
          showActiveAuctionsOverlay: false,
          showSaleHistoryOverlay: false,
          showQuestOverlay: false,
          showFriendInterestOverlay: false,
        },
      }),
    );
    const first = auction(1).id,
      second = auction(2).id;
    const chosenCopy = auction(10).id,
      failedCopy = auction(11).id;
    const batchListing = auction(12).id,
      relisted = auction(13).id;
    const unknownRelist = auction(14).id;
    const historicalCopy = auction(15).id,
      historicalSale = auction(16).id;
    // An existing profile has an auction index but no copy index yet.
    await worker.evaluate(
      ({ copyId, id }) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("kosmore.confirmed-listings", 1);
          open.onupgradeneeded = () => {
            const rows = open.result.createObjectStore("records", {
              keyPath: "seq",
              autoIncrement: true,
            });
            rows.createIndex("auction", ["owner", "id"], { unique: true });
            rows.createIndex("latest", [
              "owner",
              "subjectId",
              "submittedAt",
              "id",
            ]);
            rows.createIndex("outbox", ["owner", "seq"]);
            open.result.createObjectStore("state");
            rows.add({
              owner: "local:fixtureplayer",
              copyId,
              id,
              subjectId: "42",
              startPrice: "123",
              submittedAt: Date.now() - 86400000,
            });
          };
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            open.result.close();
            resolve();
          };
        }),
      { copyId: historicalCopy, id: auction(17).id },
    );
    let listingReads = 0;
    let rejectCancel = false;
    let nativeListing: string | undefined;
    await context.route("https://kosmora.io/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me") return route.fulfill({ json: me });
      if (
        route.request().method() === "GET" &&
        (path === "/api/me/auctions" || path.startsWith("/api/auctions/"))
      ) {
        listingReads++;
        return route.fulfill({
          json: myListingPage([
            myListing(14, "42", {
              group: "selling",
              state: "open",
              endsAt: "2099-01-01",
            }),
          ]),
        });
      }
      if (path === "/api/market/listings/batch")
        return route.fulfill({
          json:
            route.request().method() === "GET"
              ? {
                  items: [
                    {
                      subjectId: "42",
                      instanceId: COPY_A,
                      copies: [{ id: chosenCopy }],
                    },
                    { subjectId: "43", instanceId: failedCopy },
                  ],
                }
              : {
                  results: [
                    { ok: false, instanceId: failedCopy },
                    {
                      ok: true,
                      instanceId: chosenCopy,
                      auctionId: batchListing,
                    },
                  ],
                },
        });
      if (path.endsWith("/relist"))
        return route.fulfill({
          json: {
            auctionId: path.includes(batchListing) ? relisted : unknownRelist,
          },
        });
      if (path === "/api/collection/42") {
        const detail = card();
        return route.fulfill({
          json: {
            ...detail,
            copies: [COPY_A, COPY_B].map((id) => ({
              ...detail.copies[0],
              id,
              auction_id: id === COPY_A ? nativeListing : undefined,
            })),
          },
        });
      }
      if (path === "/api/auctions")
        return route.fulfill({
          json: {
            auctionId:
              route.request().postDataJSON().instanceId === historicalCopy
                ? historicalSale
                : route.request().postDataJSON().instanceId === COPY_A
                  ? first
                  : second,
          },
        });
      if (route.request().method() === "DELETE")
        return route.fulfill({ status: rejectCancel ? 409 : 204 });
      if (path.startsWith("/api/") || path.startsWith("/media/"))
        return route.fulfill({ json: {} });
      return route.fulfill({
        contentType: "text/html",
        body: '<main><a href="/card/42">' + face() + "</a></main>",
      });
    });
    const collection = await context.newPage(),
      album = await context.newPage();
    await collection.goto("https://kosmora.io/collection");
    await album.goto("https://kosmora.io/albums/fixture");
    const listed = (copy: string) =>
      collection.evaluate(
        (instanceId) =>
          fetch("/api/auctions", {
            method: "POST",
            body: JSON.stringify({ instanceId, startPrice: "1000000" }),
          }).then((r) => r.ok),
        copy,
      );
    const cancel = (id: string) =>
      collection.evaluate(
        (auctionId) =>
          fetch("/api/auctions/" + auctionId, { method: "DELETE" }).then(
            (r) => r.ok,
          ),
        id,
      );
    await collection.evaluate(() =>
      fetch("/api/collection/42").then((r) => r.json()),
    );
    await listed(COPY_A);
    const collectionLabel = collection.locator("main .on-sale"),
      albumLabel = album.locator(".kc-window .on-sale");
    await expect(collectionLabel).toBeVisible();
    await expect(albumLabel).toBeVisible();
    await album.reload();
    await expect(albumLabel).toBeVisible();
    await listed(COPY_B);
    await cancel(first);
    rejectCancel = true;
    expect(await cancel(second)).toBe(false);
    await expect(albumLabel).toBeVisible();
    rejectCancel = false;
    await cancel(second);
    await expect(collectionLabel).toHaveCount(0);
    await expect(albumLabel).toHaveCount(0);
    nativeListing = auction(3).id;
    await album.evaluate(() =>
      fetch("/api/collection/42").then((r) => r.json()),
    );
    await expect(albumLabel).toBeVisible();
    await expect(collectionLabel).toBeVisible();
    await album.evaluate(
      (id) =>
        fetch("/api/auctions/" + id, { method: "DELETE" }).then((r) => r.ok),
      nativeListing,
    );
    await expect(albumLabel).toHaveCount(0);
    await expect(collectionLabel).toHaveCount(0);
    // Enable price capture for the batch so a later tab can resolve its auction from history.
    await worker.evaluate(async () => {
      const key = "kosmore.settings";
      const settings = (await chrome.storage.local.get(key))[key] as object;
      await chrome.storage.local.set({
        [key]: {
          ...settings,
          salesOverlaysEnabled: true,
          showSalesMyLastListing: true,
        },
      });
    });
    const sell = await context.newPage();
    await sell.goto("https://kosmora.io/market/sell/batch");
    await sell.evaluate(
      async ([chosen, failed]) => {
        await fetch("/api/market/listings/batch?subjects=42,43").then((r) =>
          r.json(),
        );
        await fetch("/api/market/listings/batch", {
          method: "POST",
          body: JSON.stringify({
            items: [chosen, failed].map((instanceId) => ({
              instanceId,
              startPrice: "1000000",
            })),
          }),
        });
      },
      [chosenCopy, failedCopy],
    );
    await expect(albumLabel).toBeVisible();
    await expect(collectionLabel).toBeVisible();
    expect(listingReads).toBe(0);
    await cancel(batchListing);
    await expect(albumLabel).toHaveCount(0);
    await expect
      .poll(() =>
        worker.evaluate(async (id) => {
          const key = "kosmore.listingRecord.fixtureplayer.42";
          const record = (await chrome.storage.local.get(key))[key] as
            { listings: { id: string }[] } | undefined;
          return record?.listings.some((row) => row.id === id);
        }, batchListing),
      )
      .toBe(true);
    // Age this auction out of the short-lived overlay cache, retaining the
    // other copies' cancellations and the longer-lived saved price history.
    await worker.evaluate(async (id) => {
      const key = "kosmore.saleStatus.fixtureplayer";
      const cache = (await chrome.storage.local.get(key))[key] as {
        changes: Record<string, unknown>;
      };
      delete cache.changes[id];
      await chrome.storage.local.set({ [key]: cache });
    }, batchListing);
    await sell.reload();
    await sell.evaluate(
      (previous) =>
        fetch("/api/auctions/" + previous + "/relist", {
          method: "POST",
          body: JSON.stringify({ expectedFee: "123" }),
        }).then((r) => r.ok),
      batchListing,
    );
    await expect(albumLabel).toBeVisible();
    await expect(collectionLabel).toBeVisible();
    expect(listingReads).toBe(0);
    await cancel(relisted);
    await expect(albumLabel).toHaveCount(0);
    await sell.evaluate(
      (old) =>
        fetch("/api/auctions/" + old + "/relist", {
          method: "POST",
          body: JSON.stringify({ expectedFee: "123" }),
        }).then((r) => r.ok),
      auction(99).id,
    );
    await expect
      .poll(() =>
        worker.evaluate(async (id) => {
          const key = "kosmore.saleStatus.fixtureplayer";
          const cache = (await chrome.storage.local.get(key))[key] as {
            changes: Record<string, { listed?: number }>;
          };
          return !!cache?.changes[id]?.listed;
        }, unknownRelist),
      )
      .toBe(true);
    expect(listingReads).toBe(0);
    await expect(albumLabel).toHaveCount(0);
    // The game itself subsequently opens My Auctions.
    await sell.evaluate(() => fetch("/api/me/auctions").then((r) => r.json()));
    await expect(albumLabel).toBeVisible();
    expect(listingReads).toBe(1);
    await cancel(unknownRelist);
    await expect(albumLabel).toHaveCount(0);
    await listed(historicalCopy);
    await expect(albumLabel).toBeVisible();
    expect(listingReads).toBe(1);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
