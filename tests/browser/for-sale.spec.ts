import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launchTestBrowser } from "./browser";
import { card, COPY_A, COPY_B, face, me } from "../fixtures/data";
import { auction } from "../fixtures/auctions";

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
    let rejectCancel = false;
    let nativeListing: string | undefined;
    await context.route("https://kosmora.io/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me") return route.fulfill({ json: me });
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
              route.request().postDataJSON().instanceId === COPY_A
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
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
