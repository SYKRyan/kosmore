import { questCatalog } from "../fixtures/quests";
import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Route,
  type Worker,
  type Locator,
} from "@playwright/test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { launchTestBrowser } from "./browser";
import { socialFixture } from "../fixtures/social";
import { familyCatalog } from "../fixtures/families";
import { NAVIGATION } from "../../src/shared/hotkeys";
import {
  batchSellRow,
  sellManyFixture,
  singleSellFixture,
} from "../fixtures/sell-many";
import { multiSelectFixture } from "../fixtures/multi-select";
import { auction, auctionPage } from "../fixtures/auctions";
import { myListing, myListingPage } from "../fixtures/my-listings";
import {
  FUSION_FAMILIES,
  familyMilestones,
  fusionFixture,
  fusionGrid,
  fusionMembership,
  fusionRecipes,
  myFamilies,
} from "../fixtures/fusion";
import {
  activityRow,
  journalRow,
  marketActivityFixture,
} from "../fixtures/market-activity";
import {
  ALBUM_A,
  ALBUM_B,
  COPY_A,
  COPY_B,
  OPENING,
  albums,
  card,
  face,
  friends,
  me,
  opening,
  prices,
} from "../fixtures/data";
let context: BrowserContext,
  worker: Worker,
  page: Page,
  extensionId: string,
  profile: string;
let variantFailure = false,
  familyCatalogFailure = false,
  legacyMarket = false,
  sellMany = false,
  holdSlow = false,
  inventoryEmpty = false,
  writeRequests = 0,
  membership = false,
  account = "FixturePlayer";
const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="350"><defs><radialGradient id="g"><stop stop-color="#674b94"/><stop offset="1" stop-color="#16132e"/></radialGradient></defs><rect width="400" height="350" fill="url(#g)"/><g fill="#e8d4a2"><circle cx="75" cy="55" r="2"/><circle cx="330" cy="90" r="3"/><circle cx="125" cy="220" r="2"/><circle cx="270" cy="290" r="2"/><path d="M200 90 212 155 280 175 212 194 200 255 184 194 120 175 184 155Z"/></g></svg>`;
function fixture(mode: "summary" | "reveal" | "page" = "summary") {
  const cards = Array.from(
    { length: 6 },
    (_, i) =>
      `<li>${face(i < 2 ? "42" : String(43 + i), ["Northern Lights", "Northern Lights", "Voyager 1", "Andromeda", "Orion Nebula", "Cassini"][i])}<button class="ko-grid-open" aria-label="See card up close" onclick="document.body.dataset.opens=String(Number(document.body.dataset.opens||0)+1)"></button><span class="new">✦ NEW FOR YOU ✦</span></li>`,
  ).join("");
  return `<!doctype html><html><head><title>Kosmora fixture · KosMore verification</title><style>body{background:radial-gradient(ellipse at top,#2f2050,#0c081d 65%);color:#f9e6b6;font:14px system-ui;margin:0;padding:40px 24px;min-height:100vh}h1{font:36px Georgia;text-align:center;margin:0 0 25px}.ko-summary{max-width:1150px;margin:auto}.ko-grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;max-width:790px;margin:auto}.ko-grid>li{position:relative}.kc-article{border:2px solid #a8b1cd;border-radius:12px;background:#243147;padding:8px;box-shadow:0 0 0 4px #b8d0e21c;color:#f4f0dd}.kc-name{font:600 16px Georgia;margin:8px}.kc-img{width:100%;height:190px;object-fit:cover;border-radius:6px}.kc footer{font-size:10px;color:#c4b6d5;margin:10px}.ko-grid-open{position:absolute;inset:0;border:0;background:transparent;cursor:pointer}.new{display:block;text-align:center;color:#d8b574;font-size:10px;margin-top:14px}.op-actions{text-align:center;margin:35px}.op-actions button{background:linear-gradient(#fff0b5,#d5ac60);border:0;border-radius:10px;color:#261a24;padding:18px 35px;font-weight:650}.ko-card{width:300px;margin:40px auto;cursor:pointer}.ko-tray{display:flex;justify-content:center;list-style:none;gap:10px}.ko-tray li{width:8px;height:8px;border-radius:50%;background:#55466d}.ko-tray li.on{background:#f3dda8}.ko-viewer-sheet{background:#110d23;color:white}.ko-viewer-sheet::backdrop{background:#100a23bb}</style></head><body data-advances="0" data-opens="0"><main id="main">${mode === "summary" ? `<div class="ko-summary"><h1>Nice pull</h1><ul class="ko-grid">${cards}</ul><div class="op-actions"><button onclick="document.body.dataset.advances='1'">OPEN THE NEXT PACK</button></div></div>` : mode === "reveal" ? `<h1>Your pack</h1><div class="ko-card ko-beat-shown" role="button" tabindex="0" onclick="document.body.dataset.advances=String(Number(document.body.dataset.advances)+1)"><div class="ko-face-front">${face()}</div><div class="ko-face-back" hidden><div class="kc kc-back" aria-hidden="true"></div></div></div><ol class="ko-tray"><li class="on"></li><li></li></ol>` : `<h1>Collection</h1><a href="/card/42" style="display:block;width:270px;margin:30px">${face()}</a>`}</main></body></html>`;
}
test.beforeAll(async () => {
  profile = await mkdtemp(resolve(tmpdir(), "kosmore-test-"));
  context = await launchTestBrowser(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${resolve("dist")}`,
      `--load-extension=${resolve("dist")}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  extensionId = new URL(worker.url()).host;
  await context.route("https://kosmora.io/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    let body: unknown;
    if (path.startsWith("/api/")) {
      if (req.method() !== "GET") {
        writeRequests++;
        if (
          path === `/api/albums/${ALBUM_A}/items` &&
          req.method() === "POST"
        ) {
          membership = true;
          await route.fulfill({ json: { added: 1 } });
          return;
        }
        if (
          path === `/api/albums/${ALBUM_A}/items/42` &&
          req.method() === "DELETE"
        ) {
          if (req.postData() !== "{}") {
            await route.fulfill({
              status: 400,
              json: { code: "invalid_json" },
            });
            return;
          }
          membership = false;
          await route.fulfill({ json: { position: 1, copyId: COPY_B } });
          return;
        }
        await route.fulfill({
          status: 400,
          json: { code: "unexpected_write" },
        });
        return;
      }
      if (path === "/api/atlas/families") {
        if (familyCatalogFailure) {
          await route.fulfill({ status: 503, json: { code: "unavailable" } });
          return;
        }
        body = familyCatalog;
      } else if (path === "/api/me/auctions") body = myListingPage();
      else if (path === "/api/me") body = { ...me, handle: account };
      else if (path === "/api/auctions") body = auctionPage();
      else if (path === "/api/friends") body = friends;
      else if (path === "/api/quests") body = questCatalog;
      else if (path.startsWith("/api/collection/")) {
        const id = path.split("/").at(-1)!;
        if (id === "42" && holdSlow)
          await new Promise((r) => setTimeout(r, 650));
        body = {
          ...card(id),
          copies: inventoryEmpty
            ? []
            : [...card(id).copies, { ...card(id).copies[0], id: COPY_B }],
        };
      } else if (path.startsWith("/api/cards/") && path.endsWith("/prices")) {
        if (variantFailure && url.searchParams.get("finish") === "veil") {
          await route.fulfill({ status: 503, json: { code: "unavailable" } });
          return;
        }
        body = prices(url.searchParams.get("finish") === "fullart" ? 0 : 3);
      } else if (path === "/api/albums") body = albums(membership);
      else if (path.startsWith("/api/openings/")) body = opening;
      else {
        await route.fulfill({ status: 404, json: { code: "not_found" } });
        return;
      }
      await route.fulfill({ json: body });
      return;
    }
    if (path.startsWith("/media/")) {
      await route.fulfill({ contentType: "image/svg+xml", body: artwork });
      return;
    }
    if (path === "/social") {
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: socialFixture(
          account,
          url.searchParams.get("f") === "FriendB" ? "FriendB" : "batu",
        ),
      });
      return;
    }
    if (path === "/market/sell/batch") {
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: sellManyFixture(true),
      });
      return;
    }
    if (path === "/market/sell") {
      await route.fulfill({
        contentType: "text/html",
        body: singleSellFixture(url.searchParams.get("subject") ?? "42"),
      });
      return;
    }
    if (path === "/market" && sellMany) {
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: sellManyFixture(),
      });
      return;
    }
    if (path === "/market") {
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        body:
          url.searchParams.get("view") === "mine"
            ? marketActivityFixture()
            : `<!doctype html><html><body><h1>Market</h1><button data-testid="${legacyMarket ? "watch-open" : "market-alerts"}" onclick="document.querySelector('dialog').showModal()">Alerts</button><dialog aria-label="Market Alerts"><p>Watched words</p></dialog></body></html>`,
      });
      return;
    }
    await route.fulfill({
      contentType: "text/html",
      body: fixture(
        path === "/collection"
          ? "page"
          : url.searchParams.get("recap")
            ? "summary"
            : "reveal",
      ),
    });
  });
  page = await context.newPage();
});
test.beforeEach(async () => {
  await page.goto("about:blank");
  variantFailure = false;
  familyCatalogFailure = false;
  legacyMarket = false;
  sellMany = false;
  holdSlow = false;
  inventoryEmpty = false;
  membership = false;
  writeRequests = 0;
  account = "FixturePlayer";
  await worker.evaluate(
    async ({ a, b }) => {
      await chrome.storage.session.clear();
      await chrome.storage.local.remove("kosmore.myListingPrices");
      const all = await chrome.storage.local.get(null);
      await chrome.storage.local.remove(
        Object.keys(all).filter((key) => key.startsWith("kosmore.friend.")),
      );
      await chrome.storage.local.set({
        "kosmore.marketFinishes": ["plain", "veil", "fullart"],
        "kosmore.settings": {
          schemaVersion: 1,
          enabled: true,
          hoverDelayMs: 100,
          showSaleHistoryOverlay: false,
          showActiveAuctionsOverlay: false,
          showOnSaleOverlay: false,
          showFriendInterestOverlay: false,
          showQuestOverlay: false,
          pinnedAlbums: { fixtureplayer: [a, b] },
        },
      });
    },
    { a: ALBUM_A, b: ALBUM_B },
  );
});
test.afterAll(async () => {
  await context?.close();
  if (profile) {
    const target = resolve(profile);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("kosmore-test-")
    )
      throw new Error("Unexpected browser profile path.");
    await rm(target, { recursive: true, force: true });
  }
});

async function enableTooltipButtons() {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        useOverlayButtonInsteadOfHover: true,
        cardOverlaysEnabled: false,
      },
    });
  });
}
const tooltipButtonLayer = () => page.locator("[data-kosmore-tooltip-buttons]");
const tooltipButton = (name = "Northern Lights") =>
  tooltipButtonLayer().getByRole("button", {
    name: `Open card tooltip for ${name}`,
    exact: true,
  });

test("tooltip icon tabs remember the last selection across cards, dismissal, refresh and navigation", async () => {
  await enableTooltipButtons();
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await tooltipButton().first().click();
  const popup = page.locator("#kosmore-root");
  for (const name of ["Market", "My listing history", "Trade", "Notes"]) {
    const tab = popup.getByRole("tab", { name, exact: true });
    await expect(tab.locator("svg")).toHaveCount(1);
    await expect(tab).toHaveText("");
  }
  await expect(
    popup.getByRole("button", { name: "Settings", exact: true }).locator("svg"),
  ).toHaveCount(1);
  await popup.getByRole("tab", { name: "Notes", exact: true }).click();
  await popup
    .getByRole("button", { name: "Close KosMore popup", exact: true })
    .click();
  await tooltipButton("Voyager 1").click();
  await expect(
    popup.getByRole("tab", { name: "Notes", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await popup
    .getByRole("button", { name: "Close KosMore popup", exact: true })
    .click();
  await tooltipButton().first().click();
  await expect(
    popup.getByRole("tab", { name: "Notes", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await popup.getByRole("tab", { name: "Trade", exact: true }).click();
  await expect
    .poll(() =>
      worker.evaluate(async () =>
        Object.values(await chrome.storage.session.get(null)).some(
          (value) => (value as { tab?: string }).tab === "trade",
        ),
      ),
    )
    .toBe(true);
  await page.reload();
  await tooltipButton().first().click();
  await expect(
    popup.getByRole("tab", { name: "Trade", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await page.goto("https://kosmora.io/collection");
  await expect(popup).toHaveAttribute("data-empty", "");
  await tooltipButton().click();
  await expect(
    popup.getByRole("tab", { name: "Trade", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await popup.getByRole("tab", { name: "Trade", exact: true }).press("Home");
  await expect(
    popup.getByRole("tab", { name: "Market", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await popup.getByRole("button", { name: "Unpin popup", exact: true }).click();
  await popup
    .getByRole("button", { name: "Close KosMore popup", exact: true })
    .click();
  await tooltipButton().click();
  await expect(
    popup.getByRole("tab", { name: "Market", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(writeRequests).toBe(0);
});

test("overlay button: setting defaults off, cancels drafts, saves independently, and follows the tooltip master", async () => {
  await page.goto("https://kosmora.io/collection");
  await expect(tooltipButtonLayer()).toHaveCount(0);
  const options = await context.newPage();
  try {
    await options.goto(
      `chrome-extension://${extensionId}/options.html#hover-tooltip`,
    );
    const group = options.locator("#hover-tooltip"),
      toggle = group.getByLabel("Use Overlay Button Instead of Hover", {
        exact: true,
      });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await group
      .getByRole("button", {
        name: "Cancel tooltip settings changes",
        exact: true,
      })
      .click();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await group
      .getByRole("button", { name: "Save tooltip settings", exact: true })
      .click();
    await expect(tooltipButton()).toBeVisible();
    await options.reload();
    await expect(toggle).toBeChecked();
    await group
      .getByRole("switch", { name: "Enable card hover tooltips", exact: true })
      .uncheck();
    await expect(tooltipButtonLayer()).toHaveCount(0);
    await expect(toggle).toBeDisabled();
    await group
      .getByRole("switch", { name: "Enable card hover tooltips", exact: true })
      .check();
    await expect(tooltipButton()).toBeVisible();
    await toggle.uncheck();
    await group
      .getByRole("button", { name: "Save tooltip settings", exact: true })
      .click();
    await expect(tooltipButtonLayer()).toHaveCount(0);
    await page.locator(".kc-article").hover();
    await expect(page.locator("#kosmore-root")).toBeVisible();
  } finally {
    await options.close();
  }
});

test("overlay button: hover and focus wait for a press, recap copies stay exact, and native controls remain independent", async () => {
  await enableTooltipButtons();
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await expect(tooltipButton()).toHaveCount(2);
  await expect(tooltipButton().first()).toBeVisible();
  await page.locator(".ko-grid-open").nth(1).hover();
  await tooltipButton().nth(1).focus();
  await page.waitForTimeout(200);
  await expect(page.locator("#kosmore-root")).toHaveCount(0);
  await tooltipButton().nth(1).press("Enter");
  const popup = page.locator("#kosmore-root");
  await expect(popup).toContainText("Northern Lights");
  await expect(popup.locator("select")).toHaveValue(COPY_B);
  await page.mouse.move(1400, 950);
  await page.waitForTimeout(300);
  await expect(popup).toBeVisible();
  expect(await page.locator("body").getAttribute("data-opens")).toBe("0");
  await popup
    .getByRole("button", { name: "Close KosMore popup", exact: true })
    .click();
  await expect(tooltipButton().nth(1)).toBeFocused();
  await page.locator(".ko-grid-open").first().click();
  expect(await page.locator("body").getAttribute("data-opens")).toBe("1");
});

test("overlay button: touch opens a linked card without navigation, overlaps its corner, and dismisses on outside tap", async () => {
  await enableTooltipButtons();
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  const touch = await context.newCDPSession(phone);
  await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const tap = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  try {
    await phone.goto("https://kosmora.io/collection");
    // Keep the existing native card fully visible on this narrow fixture.
    await phone.locator("a").evaluate((e) => (e.style.margin = "16px"));
    const button = phone.locator("[data-kosmore-tooltip-buttons] button"),
      card = phone.locator(".kc-article");
    await expect(button).toBeVisible();
    const bounds = (await button.boundingBox())!,
      faceBounds = (await card.boundingBox())!;
    expect(
      Math.abs(bounds.x + bounds.width / 2 - (faceBounds.x + 8)),
    ).toBeLessThan(1);
    expect(
      Math.abs(
        bounds.y + bounds.height / 2 - (faceBounds.y + faceBounds.height - 8),
      ),
    ).toBeLessThan(1);
    expect(bounds.x).toBeLessThan(faceBounds.x);
    expect(bounds.y + bounds.height).toBeGreaterThan(
      faceBounds.y + faceBounds.height,
    );
    const img = button.locator("img");
    await expect(img).toHaveJSProperty("complete", true);
    expect(
      await img.evaluate((e) => (e as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    await mkdir("test-results/screenshots", { recursive: true });
    await phone.screenshot({
      path: "test-results/screenshots/tooltip-button-phone.png",
    });
    await tap(button);
    await expect(phone.locator("#kosmore-root")).toContainText(
      "Northern Lights",
    );
    expect(new URL(phone.url()).pathname).toBe("/collection");
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 2, y: 2 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(phone.locator("#kosmore-root")).toHaveCount(0);
  } finally {
    await phone.close();
  }
});

test("overlay button: native multi-select and dialog pickers are not selected by tooltip presses", async () => {
  await enableTooltipButtons();
  await page.route("https://kosmora.io/collection", (route) =>
    route.fulfill({ contentType: "text/html", body: multiSelectFixture() }),
  );
  await page.goto("https://kosmora.io/collection");
  await expect(tooltipButton()).toBeVisible();
  await page.locator(".kc-link").first().dispatchEvent("pointerdown");
  await expect(page.locator(".pick-hit")).toHaveCount(2);
  await expect(tooltipButton()).toBeVisible();
  await tooltipButton().click();
  await expect(page.locator("#kosmore-root")).toContainText("Northern Lights");
  await expect(page.locator(".pick-hit").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".pick-hit").nth(1)).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.keyboard.press("Escape");
  sellMany = true;
  await page.goto("https://kosmora.io/market");
  await expect(tooltipButton()).toBeVisible();
  await tooltipButton().click();
  await expect(page.locator("#kosmore-root")).toContainText("Northern Lights");
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator(".pick-hit[aria-pressed=true]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toBeVisible();
  await expect(tooltipButton()).toBeFocused();
  await page.unroute("https://kosmora.io/collection");
});

test("overlay button: follows replaced cards and scroll clipping without changing native layout", async () => {
  await enableTooltipButtons();
  await page.goto("https://kosmora.io/collection");
  await expect(tooltipButton()).toBeVisible();
  await page.locator("a").evaluate((e) => {
    const clip = document.createElement("div");
    clip.id = "clip";
    clip.style.cssText = "height:160px;overflow:auto;width:350px";
    e.before(clip);
    clip.append(e);
  });
  await expect(tooltipButton()).toBeHidden();
  await page.locator("#clip").evaluate((e) => (e.scrollTop = e.scrollHeight));
  await expect(tooltipButton()).toBeVisible();
  await page
    .locator("a")
    .evaluate(
      (e, html) =>
        (e.outerHTML = `<a href="/card/46" style="display:block;width:270px;margin:30px">${html}</a>`),
      face("46", "Andromeda"),
    );
  await expect(tooltipButton()).toHaveCount(0);
  await expect(tooltipButton("Andromeda")).toBeVisible();
  await tooltipButton("Andromeda").click();
  await expect(page.locator("#kosmore-root")).toContainText("Andromeda");
  await page.locator("#clip > a").evaluate((e) => e.remove());
  await expect(tooltipButton("Andromeda")).toHaveCount(0);
  await expect(page.locator("#kosmore-root")).toHaveCount(0);
});

test("overlay button: pinned details change only on a press and reveal buttons never advance the pack", async () => {
  await enableTooltipButtons();
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await tooltipButton().first().click();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await page.locator(".ko-grid-open").nth(3).hover();
  await page.waitForTimeout(200);
  await expect(popup.locator("h2")).toHaveText("Northern Lights");
  await tooltipButton("Andromeda").click();
  await expect(popup.locator("h2")).toHaveText("Andromeda");
  await expect(popup).toHaveAttribute("data-pinned", "");
  await page.keyboard.press("Escape");
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}`);
  await tooltipButton().click();
  await expect(popup).toContainText("Northern Lights");
  await expect(page.locator("body")).toHaveAttribute("data-advances", "0");
  await page.keyboard.press("Escape");
  await page.locator(".ko-card").click();
  await expect(page.locator("body")).toHaveAttribute("data-advances", "1");
});

test("overlay button: stays attached through synchronous nested scrolling without waiting for a frame", async () => {
  await enableTooltipButtons();
  await page.goto("https://kosmora.io/collection");
  await expect(tooltipButton()).toBeVisible();
  await page.locator("a").evaluate((link) => {
    const scroller = document.createElement("div"),
      content = document.createElement("div");
    scroller.id = "glued-scroll";
    scroller.style.cssText = "width:450px;height:450px;overflow:auto";
    content.style.cssText =
      "box-sizing:border-box;width:900px;height:1600px;padding:120px;position:relative";
    link.before(scroller);
    scroller.append(content);
    content.append(link);
    link.style.margin = "0";
  });
  await expect(tooltipButton()).toBeVisible();
  await expect(
    page.locator("#glued-scroll [data-kosmore-tooltip-buttons]"),
  ).toHaveCount(1);
  const offsets = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>("#glued-scroll")!;
    const card = document.querySelector(".kc-article")!;
    const host = document.querySelector("[data-kosmore-tooltip-buttons]")!;
    const button = host.shadowRoot!.querySelector("button")!;
    const values = [];
    for (const amount of [0, 37, 80, 15, 55, 0]) {
      // All samples happen in one JS task, before any scroll/animation callback.
      scroller.scrollTop = amount;
      scroller.scrollLeft = amount / 2;
      const face = card.getBoundingClientRect(),
        rect = button.getBoundingClientRect();
      values.push({
        x: rect.left + rect.width / 2 - face.left,
        y: rect.top + rect.height / 2 - face.bottom,
      });
    }
    return values;
  });
  for (const offset of offsets) {
    expect(Math.abs(offset.x - 8)).toBeLessThan(1);
    expect(Math.abs(offset.y + 8)).toBeLessThan(1);
  }
});

test("overlay button: many-sale cards use the listing-box corner and leave price and copy controls unchanged", async () => {
  await enableTooltipButtons();
  await page.goto("https://kosmora.io/market/sell/batch");
  const rows = page.locator(".bsell-row"),
    first = tooltipButton(),
    second = tooltipButton("Andromeda");
  await expect(tooltipButtonLayer()).toHaveCount(2);
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(
    rows.locator(".kc-article [data-kosmore-tooltip-buttons]"),
  ).toHaveCount(0);
  const box = (await rows.first().boundingBox())!,
    rect = (await first.boundingBox())!;
  expect(Math.abs(rect.x + rect.width / 2 - (box.x + 8))).toBeLessThan(1);
  expect(
    Math.abs(rect.y + rect.height / 2 - (box.y + box.height - 8)),
  ).toBeLessThan(1);
  await rows.first().locator(".bsell-name").hover();
  await page.waitForTimeout(200);
  await expect(page.locator("#kosmore-root")).toHaveCount(0);
  await first.click();
  await expect(page.locator("#kosmore-root")).toContainText("Northern Lights");
  await expect(page.locator("body")).toHaveAttribute("data-copy-clicks", "0");
  await expect(
    page.getByLabel("Starting price for Northern Lights", { exact: true }),
  ).toHaveValue("12.00");
  await page.keyboard.press("Escape");
  await second.click();
  await expect(page.locator("#kosmore-root")).toContainText("Andromeda");
  await page.keyboard.press("Escape");
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/tooltip-buttons-many-sale.png",
  });
  await page
    .getByRole("button", {
      name: "Choose copy of Northern Lights",
      exact: true,
    })
    .click();
  await expect(page.locator("body")).toHaveAttribute("data-copy-clicks", "1");
  await page
    .getByRole("button", { name: "Remove Northern Lights", exact: true })
    .click();
  await expect(first).toHaveCount(0);
  await expect(second).toBeVisible();
});

test("outside dismissal: preference defaults off, cancels, saves and applies to an open game tab", async () => {
  await enableTooltipButtons();
  await page.goto("https://kosmora.io/collection");
  await tooltipButton().click();
  // The default preserves the existing click-through behavior.
  await page.locator('a[href="/card/42"]').click();
  await expect(page).toHaveURL("https://kosmora.io/card/42");
  const options = await context.newPage();
  try {
    await options.goto(
      `chrome-extension://${extensionId}/options.html#hover-tooltip`,
    );
    const group = options.locator("#hover-tooltip"),
      toggle = group.getByLabel("Outside Click Closes Tooltip Only", {
        exact: true,
      });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await group
      .getByRole("button", {
        name: "Cancel tooltip settings changes",
        exact: true,
      })
      .click();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await group
      .getByRole("button", { name: "Save tooltip settings", exact: true })
      .click();
    await expect(group.getByRole("status")).toContainText("Saved.");
    await options.reload();
    await expect(toggle).toBeChecked();
    await mkdir("test-results/screenshots", { recursive: true });
    await group.screenshot({
      path: "test-results/screenshots/outside-click-settings.png",
    });
    await page.goto("https://kosmora.io/collection");
    await tooltipButton().click();
    await expect(page.locator("#kosmore-root")).toBeVisible();
    await page.locator('a[href="/card/42"]').click();
    await expect(page.locator("#kosmore-root")).toHaveCount(0);
    await expect(page).toHaveURL("https://kosmora.io/collection");
    await page.locator('a[href="/card/42"]').click();
    await expect(page).toHaveURL("https://kosmora.io/card/42");
  } finally {
    await options.close();
  }
});

test("outside dismissal: hover tooltips consume a dismissal click while pinned tooltips retain native navigation", async () => {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": { ...settings, outsideClickClosesTooltipOnly: true },
    });
  });
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  await expect(page.locator("#kosmore-root")).toBeVisible();
  await page.locator('a[href="/card/42"]').click();
  await expect(page.locator("#kosmore-root")).toHaveCount(0);
  await expect(page).toHaveURL("https://kosmora.io/collection");
  await page.mouse.move(10, 10);
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await page.locator('a[href="/card/42"]').click();
  await expect(page).toHaveURL("https://kosmora.io/card/42");
  await expect(popup).toHaveAttribute("data-pinned", "");
});

test("outside dismissal: moving to another card does not allow a quick dismissal click to activate it", async () => {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        outsideClickClosesTooltipOnly: true,
        hoverDelayMs: 500,
      },
    });
  });
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").first().hover();
  await expect(page.locator("#kosmore-root")).toBeVisible();
  const other = page.locator(".ko-grid-open").nth(3);
  await other.hover();
  await page.locator("#kosmore-root").hover();
  await page.waitForTimeout(550);
  await expect(page.locator("#kosmore-root h2")).toHaveText("Northern Lights");
  await other.click();
  await expect(page.locator("#kosmore-root")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-opens", "0");
  await other.click();
  await expect(page.locator("body")).toHaveAttribute("data-opens", "1");
});

test("outside dismissal: unpinned tooltips consume native multi-select presses and pinned ones permit them", async () => {
  await enableTooltipButtons();
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": { ...settings, outsideClickClosesTooltipOnly: true },
    });
  });
  await page.route("https://kosmora.io/collection", (route) =>
    route.fulfill({ contentType: "text/html", body: multiSelectFixture() }),
  );
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-link").first().dispatchEvent("pointerdown");
    await expect(page.locator(".pick-hit")).toHaveCount(2);
    await tooltipButton().click();
    await expect(page.locator("#kosmore-root")).toBeVisible();
    await page.evaluate(() => {
      document.body.dataset.outsideDowns = "0";
      document.addEventListener(
        "pointerdown",
        () => {
          document.body.dataset.outsideDowns = String(
            Number(document.body.dataset.outsideDowns) + 1,
          );
        },
        true,
      );
    });
    const pick = page.locator(".pick-hit").first();
    await pick.click();
    await expect(page.locator("#kosmore-root")).toHaveCount(0);
    await expect(pick).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("body")).toHaveAttribute(
      "data-outside-downs",
      "0",
    );
    await pick.click();
    await expect(pick).toHaveAttribute("aria-pressed", "false");
    await tooltipButton().click();
    const popup = page.locator("#kosmore-root");
    await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
    await pick.click();
    await expect(pick).toHaveAttribute("aria-pressed", "true");
    await expect(popup).toHaveAttribute("data-pinned", "");
  } finally {
    await page.unroute("https://kosmora.io/collection");
  }
});

test("outside dismissal: touch dismisses without following the underlying card link and the next tap works", async () => {
  await enableTooltipButtons();
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        outsideClickClosesTooltipOnly: true,
        popupHeight: 480,
      },
    });
  });
  const phone = await context.newPage();
  try {
    await phone.setViewportSize({ width: 390, height: 844 });
    const touch = await context.newCDPSession(phone);
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    const tap = async (x: number, y: number) => {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    await phone.goto("https://kosmora.io/collection");
    await phone.locator(".kc-img").evaluate((e) => (e.style.height = "550px"));
    const button = phone.locator("[data-kosmore-tooltip-buttons] button");
    await expect(button).toBeVisible();
    const trigger = (await button.boundingBox())!;
    await tap(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
    const popup = phone.locator("#kosmore-root");
    await expect(popup).toBeVisible();
    const card = (await phone.locator(".kc-article").boundingBox())!,
      bounds = (await popup.boundingBox())!;
    const x = card.x + card.width / 2,
      y = card.y + card.height - 40;
    expect(y).toBeGreaterThan(bounds.y + bounds.height);
    await tap(x, y);
    await expect(popup).toHaveCount(0);
    await expect(phone).toHaveURL("https://kosmora.io/collection");
    await tap(x, y);
    await expect(phone).toHaveURL("https://kosmora.io/card/42");
  } finally {
    await phone.close();
  }
});

test("mobile friendly: subgroup contains all three opt-in settings and supports save, cancel, and the master switch", async () => {
  await page.goto("https://kosmora.io/collection");
  const options = await context.newPage();
  try {
    await options.goto(
      `chrome-extension://${extensionId}/options.html#hover-tooltip`,
    );
    const group = options.locator("#hover-tooltip"),
      mobile = group.getByRole("group", {
        name: "Mobile Friendly",
        exact: true,
      });
    await expect(mobile).toBeVisible();
    for (const label of [
      "Use Overlay Button Instead of Hover",
      "Outside Click Closes Tooltip Only",
      "Full Screen & Centered on Open",
    ])
      await expect(mobile.getByLabel(label, { exact: true })).not.toBeChecked();
    const full = mobile.getByLabel("Full Screen & Centered on Open", {
      exact: true,
    });
    await full.check();
    await expect(
      group.getByLabel("Tooltip width", { exact: true }),
    ).toBeDisabled();
    await expect(
      group.getByLabel("Tooltip height", { exact: true }),
    ).toBeDisabled();
    await group
      .getByRole("button", {
        name: "Cancel tooltip settings changes",
        exact: true,
      })
      .click();
    await expect(full).not.toBeChecked();
    await expect(
      group.getByLabel("Tooltip width", { exact: true }),
    ).toBeEnabled();
    await mobile
      .getByLabel("Use Overlay Button Instead of Hover", { exact: true })
      .check();
    await mobile
      .getByLabel("Outside Click Closes Tooltip Only", { exact: true })
      .check();
    await full.check();
    await group
      .getByRole("button", { name: "Save tooltip settings", exact: true })
      .click();
    await expect(tooltipButton()).toBeVisible();
    await tooltipButton().click();
    await expect(page.locator("#kosmore-root")).toHaveAttribute(
      "data-full-screen",
      "",
    );
    const rect = (await page.locator("#kosmore-root").boundingBox())!;
    expect(rect.x).toBe(24);
    expect(rect.y).toBe(24);
    await options.reload();
    await expect(full).toBeChecked();
    await group
      .getByRole("switch", { name: "Enable card hover tooltips", exact: true })
      .uncheck();
    await expect(full).toBeDisabled();
    await expect(page.locator("#kosmore-root")).toHaveCount(0);
    await group
      .getByRole("switch", { name: "Enable card hover tooltips", exact: true })
      .check();
    await options.setViewportSize({ width: 390, height: 900 });
    await group.scrollIntoViewIfNeeded();
    await mkdir("test-results/screenshots", { recursive: true });
    await group.screenshot({
      path: "test-results/screenshots/mobile-friendly-settings-390.png",
    });
    expect(
      await options.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await options.close();
  }
});

test("mobile friendly: full-screen fills and centers in the viewport on every open and resize without overwriting saved size", async () => {
  await enableTooltipButtons();
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        fullScreenCenteredOnOpen: true,
        outsideClickClosesTooltipOnly: true,
        popupWidth: 510,
        popupHeight: 700,
        popupPosition: { left: 180, top: 95 },
      },
    });
  });
  const popup = page.locator("#kosmore-root");
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1200, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("https://kosmora.io/collection");
    await tooltipButton().click();
    await expect(popup).toBeVisible();
    await expect
      .poll(async () => await popup.boundingBox())
      .toEqual({
        x: 24,
        y: 24,
        width: size.width - 48,
        height: size.height - 48,
      });
    await expect(
      popup.getByRole("button", { name: "Close KosMore popup", exact: true }),
    ).toBeVisible();
    await expect(popup.locator(".resize-handle:visible")).toHaveCount(0);
    await popup.getByRole("tab", { name: "Notes", exact: true }).click();
    await expect(popup.getByLabel("Card notes", { exact: true })).toBeVisible();
    await page.mouse.click(12, 12);
    await expect(popup).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://kosmora.io/collection");
  await tooltipButton().click();
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 500 });
  await expect
    .poll(async () => await popup.boundingBox())
    .toEqual({ x: 24, y: 24, width: 342, height: 452 });
  await page.mouse.click(12, 12);
  await expect(popup).toBeVisible();
  const stored = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get("kosmore.settings"))["kosmore.settings"],
  );
  expect(stored).toMatchObject({
    popupWidth: 510,
    popupHeight: 700,
    popupPosition: { left: 180, top: 95 },
  });
  await popup.getByRole("button", { name: "Unpin popup", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => await popup.boundingBox())
    .toEqual({ x: 24, y: 24, width: 342, height: 796 });
  const viewportSession = await context.newCDPSession(page);
  await viewportSession.send("Emulation.setPageScaleFactor", {
    pageScaleFactor: 1.25,
  });
  await expect
    .poll(() => page.evaluate(() => visualViewport!.width))
    .toBeLessThan(390);
  await expect
    .poll(async () => {
      const viewport = await page.evaluate(() => ({
        width: visualViewport!.width,
        height: visualViewport!.height,
        left: visualViewport!.offsetLeft,
        top: visualViewport!.offsetTop,
      }));
      const bounds = (await popup.boundingBox())!;
      return Math.max(
        Math.abs(bounds.x - viewport.left - 24),
        Math.abs(bounds.y - viewport.top - 24),
        Math.abs(bounds.width - viewport.width + 48),
        Math.abs(bounds.height - viewport.height + 48),
      );
    })
    .toBeLessThan(1);
  await viewportSession.send("Emulation.setPageScaleFactor", {
    pageScaleFactor: 1,
  });
  await viewportSession.detach();
  await expect
    .poll(async () => await popup.boundingBox())
    .toEqual({ x: 24, y: 24, width: 342, height: 796 });
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/full-screen-tooltip-phone.png",
  });
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": { ...settings, fullScreenCenteredOnOpen: false },
    });
  });
  await expect(popup).not.toHaveAttribute("data-full-screen", "");
  expect((await popup.boundingBox())!.height).toBeCloseTo(700, 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press("Escape");
});

test("mobile friendly: full-screen hover tooltips close from the buffer even without the click-only preference", async () => {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": { ...settings, fullScreenCenteredOnOpen: true },
    });
  });
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await expect(popup).toHaveAttribute("data-full-screen", "");
  await page.mouse.click(12, 12);
  await expect(popup).toHaveCount(0);
});

test("recap overlay resolves repeated subjects to their exact copies and adds only on an explicit click", async () => {
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").nth(1).hover();
  const popup = page.locator("#kosmore-root");
  await expect(popup).toBeVisible();
  await expect(popup.getByLabel("Owned copy")).toHaveValue(COPY_B);
  await expect(popup.locator(".stats")).toContainText("Standard");
  await expect(popup.locator(".stats")).toContainText("Shiny");
  await expect(popup.locator(".stats")).toContainText("Full art");
  expect(writeRequests).toBe(0);
  await popup
    .getByRole("button", { name: "Space & discovery", exact: true })
    .click();
  await expect(
    popup.getByRole("button", { name: /Space & discovery.*Already added/ }),
  ).toBeDisabled();
  expect(writeRequests).toBe(1);
  await expect(page.locator("body")).toHaveAttribute("data-opens", "0");
  await expect(page.locator("body")).toHaveAttribute("data-advances", "0");
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({ path: "test-results/screenshots/recap.png" });
});
test("already-added albums show a small red removal action on the right and refresh without closing", async () => {
  membership = true;
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...saved,
        closeTooltipWhenAddedToAlbum: true,
        applyCloseBehaviorToPinnedTooltips: true,
      },
    });
  });
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").first().hover();
  const popup = page.locator("#kosmore-root"),
    remove = popup.getByRole("button", {
      name: "Remove from Space & discovery",
      exact: true,
    });
  await expect(remove).toBeEnabled();
  await expect(
    popup.getByRole("button", { name: /Space & discovery.*Already added/ }),
  ).toBeDisabled();
  await expect(
    popup.getByRole("button", { name: "Remove from Favourites", exact: true }),
  ).toHaveCount(0);
  await expect(popup.locator("button button")).toHaveCount(0);
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await page.mouse.move(10, 10);
  await mkdir("test-results/screenshots", { recursive: true });
  for (const width of [440, 320]) {
    await worker.evaluate(async (popupWidth) => {
      const saved = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as object;
      await chrome.storage.local.set({
        "kosmore.settings": { ...saved, popupWidth },
      });
    }, width);
    await expect
      .poll(async () => (await popup.boundingBox())?.width)
      .toBe(width);
    await expect(popup.locator(".subtitle")).toContainText("No. 42");
    const icon = (await remove.boundingBox())!,
      tile = (await remove.locator("..").boundingBox())!;
    expect(tile.x + tile.width - (icon.x + icon.width)).toBeLessThanOrEqual(8);
    expect(icon.width).toBeLessThanOrEqual(26);
    expect(await remove.evaluate((el) => getComputedStyle(el).color)).toBe(
      "rgb(241, 118, 131)",
    );
    const layout = await popup.evaluate((host) => {
      const root = host.shadowRoot!;
      const rect = (selector: string) =>
        root.querySelector(selector)!.getBoundingClientRect();
      const album = rect(".album-add"),
        metric = rect(".metric"),
        footer = rect(".footer"),
        sell = rect(".sell-button"),
        status = rect(".album-add small"),
        trash = rect(".album-remove"),
        bounds = host.getBoundingClientRect();
      return {
        gridOffset: Math.abs(album.left - metric.left),
        columnDifference: Math.abs(album.width - metric.width),
        sellOffset: Math.abs(
          sell.left + sell.width / 2 - bounds.left - bounds.width / 2,
        ),
        statusOffset: Math.abs(
          status.top + status.height / 2 - trash.top - trash.height / 2,
        ),
        footerBelowBody: footer.top >= rect(".body").bottom - 1,
        divider: getComputedStyle(root.querySelector(".pinned-albums")!)
          .borderBottom,
        footerDivider: getComputedStyle(root.querySelector(".footer")!)
          .borderTop,
        titleAlign: getComputedStyle(root.querySelector(".album-name")!)
          .textAlign,
        statusAlign: getComputedStyle(root.querySelector(".album-add small")!)
          .textAlign,
      };
    });
    expect(layout.gridOffset).toBeLessThan(1);
    expect(layout.columnDifference).toBeLessThan(1);
    expect(layout.sellOffset).toBeLessThan(1);
    expect(layout.statusOffset).toBeLessThan(1);
    expect(layout.footerBelowBody).toBe(true);
    expect(layout.divider).toBe(layout.footerDivider);
    expect(layout.titleAlign).toBe("center");
    expect(layout.statusAlign).toBe("left");
    await popup.screenshot({
      path: `test-results/screenshots/album-removal-${width}.png`,
    });
  }
  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(popup.locator(".album-status")).toHaveText(
    "Removed from album.",
  );
  await expect(popup).toHaveAttribute("data-pinned", "");
  await expect(
    popup.getByRole("button", { name: "Space & discovery", exact: true }),
  ).toBeEnabled();
  expect(writeRequests).toBe(1);
  await expect(page.locator("body")).toHaveAttribute("data-opens", "0");
  await popup
    .getByRole("button", { name: "Space & discovery", exact: true })
    .click();
  await expect(popup).toHaveCount(0);
  expect(writeRequests).toBe(2);
});
test("album removal does not require choosing an owned copy", async () => {
  membership = true;
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await expect(popup.getByLabel("Owned copy")).toHaveValue("");
  await popup
    .getByRole("button", { name: "Remove from Space & discovery", exact: true })
    .click();
  await expect(popup.locator(".album-status")).toHaveText(
    "Removed from album.",
  );
  await expect(popup.getByLabel("Owned copy")).toHaveValue("");
  await expect(
    popup.getByRole("button", { name: /Space & discovery.*Choose a copy/ }),
  ).toBeDisabled();
  expect(writeRequests).toBe(1);
});
test("pending removal disables album actions, failure stays visible, and keyboard retry removes membership", async () => {
  membership = true;
  let release!: () => void,
    started!: () => void,
    failed = true;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(`**/api/albums/${ALBUM_A}/items/42`, async (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().postData()).toBe("{}");
    writeRequests++;
    started();
    await held;
    if (failed)
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
    else {
      membership = false;
      await route.fulfill({ json: { position: 1 } });
    }
  });
  try {
    await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
    await page.locator(".ko-grid-open").first().hover();
    const popup = page.locator("#kosmore-root"),
      remove = popup.getByRole("button", {
        name: "Remove from Space & discovery",
        exact: true,
      });
    await remove.click();
    await ready;
    await expect(remove).toBeDisabled();
    await expect(
      popup.getByRole("button", { name: "Favourites", exact: true }),
    ).toBeDisabled();
    await expect(popup.locator(".album-status")).toHaveText(
      "Removing from album…",
    );
    release();
    await expect(popup.locator(".album-status.error")).toContainText("503");
    await expect(remove).toBeEnabled();
    expect(writeRequests).toBe(1);
    failed = false;
    await remove.focus();
    await remove.press("Enter");
    await expect(remove).toHaveCount(0);
    await expect(popup.locator(".album-status")).toHaveText(
      "Removed from album.",
    );
    expect(writeRequests).toBe(2);
  } finally {
    release();
    await page.unroute(`**/api/albums/${ALBUM_A}/items/42`);
  }
});
test("the opt-in album setting saves, cancels and closes a pinned tooltip only after the addition succeeds", async () => {
  const options = await context.newPage();
  let release!: () => void, posted!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    posted = resolve;
  });
  await page.route(`**/api/albums/${ALBUM_A}/items`, async (route) => {
    writeRequests++;
    expect(route.request().postDataJSON()).toEqual({
      subjectIds: ["42"],
      copyId: COPY_A,
    });
    posted();
    await held;
    membership = true;
    await route.fulfill({ json: { added: 1 } });
  });
  try {
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const toggle = options.getByLabel(
      "Close Unpinned Tooltips When Added to Album",
      {
        exact: true,
      },
    );
    const pinnedToggle = options.getByLabel("Also Close Pinned Tooltips", {
      exact: true,
    });
    await expect(toggle).not.toBeChecked();
    await expect(pinnedToggle).not.toBeChecked();
    await expect(pinnedToggle).toBeDisabled();
    await toggle.check();
    await expect(pinnedToggle).toBeEnabled();
    await pinnedToggle.check();
    await options
      .getByRole("button", {
        name: "Cancel tooltip settings changes",
        exact: true,
      })
      .click();
    await expect(toggle).not.toBeChecked();
    await expect(pinnedToggle).not.toBeChecked();
    await expect(pinnedToggle).toBeDisabled();
    await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
    await page.locator(".ko-grid-open").first().hover();
    const popup = page.locator("#kosmore-root");
    await expect(popup.getByLabel("Owned copy")).toHaveValue(COPY_A);
    await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
    await toggle.check();
    await pinnedToggle.check();
    await toggle.uncheck();
    await expect(pinnedToggle).toBeDisabled();
    await expect(pinnedToggle).toBeChecked();
    await toggle.check();
    await expect(pinnedToggle).toBeEnabled();
    await options
      .getByRole("button", { name: "Save tooltip settings", exact: true })
      .click();
    await expect(
      options
        .getByRole("region", { name: "tooltip settings", exact: true })
        .getByRole("status"),
    ).toContainText("Saved.");
    await options.reload();
    await expect(toggle).toBeChecked();
    await expect(pinnedToggle).toBeChecked();
    await expect(pinnedToggle).toBeEnabled();
    await popup
      .getByRole("button", { name: "Space & discovery", exact: true })
      .click();
    await ready;
    await expect(popup).toBeVisible();
    await expect(popup.locator(".album-status")).toHaveText("Adding to album…");
    release();
    await expect(popup).toHaveCount(0);
    await expect
      .poll(() =>
        worker.evaluate(async () =>
          Object.values(await chrome.storage.session.get(null)).some(
            (value) =>
              value &&
              typeof value === "object" &&
              "pinned" in value &&
              value.pinned === true,
          ),
        ),
      )
      .toBe(false);
    expect(writeRequests).toBe(1);
    await expect(page.locator("body")).toHaveAttribute("data-opens", "0");
    await expect(page.locator("body")).toHaveAttribute("data-advances", "0");
    await mkdir("test-results/screenshots", { recursive: true });
    await options
      .getByRole("region", { name: "tooltip settings", exact: true })
      .screenshot({
        path: "test-results/screenshots/close-tooltip-after-album-setting.png",
      });
  } finally {
    release();
    await page.unroute(`**/api/albums/${ALBUM_A}/items`);
    await options.close();
  }
});
test("pinned tooltips stay open unless both album close settings are enabled", async () => {
  let additions = 0;
  for (const settings of [
    {
      closeTooltipWhenAddedToAlbum: true,
      applyCloseBehaviorToPinnedTooltips: false,
    },
    {
      closeTooltipWhenAddedToAlbum: false,
      applyCloseBehaviorToPinnedTooltips: true,
    },
  ]) {
    membership = false;
    await worker.evaluate(async (changes) => {
      const saved = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as object;
      await chrome.storage.local.set({
        "kosmore.settings": { ...saved, ...changes },
      });
    }, settings);
    await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
    await page.locator(".ko-grid-open").first().hover();
    const popup = page.locator("#kosmore-root");
    await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
    await popup
      .getByRole("button", { name: "Space & discovery", exact: true })
      .click();
    await expect(
      popup.getByRole("button", { name: /Space & discovery.*Already added/ }),
    ).toBeDisabled();
    await expect(popup).toHaveAttribute("data-pinned", "");
    await expect(popup.locator(".album-status")).toHaveText("Added to album.");
    expect(writeRequests).toBe(++additions);
    await page.keyboard.press("Escape");
  }
});
test("a failed album addition keeps the tooltip open and a successful retry closes it", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": { ...saved, closeTooltipWhenAddedToAlbum: true },
    });
  });
  let failed = true;
  await page.route(`**/api/albums/${ALBUM_A}/items`, async (route) => {
    writeRequests++;
    if (failed)
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
    else {
      membership = true;
      await route.fulfill({ json: { added: 1 } });
    }
  });
  try {
    await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
    await page.locator(".ko-grid-open").first().hover();
    const popup = page.locator("#kosmore-root"),
      album = popup.getByRole("button", {
        name: "Space & discovery",
        exact: true,
      });
    await expect(album).toBeEnabled();
    await album.click();
    await expect(popup.locator(".album-status.error")).toContainText("503");
    await expect(popup).toBeVisible();
    expect(writeRequests).toBe(1);
    failed = false;
    await expect(album).toBeEnabled();
    await album.click();
    await expect(popup).toHaveCount(0);
    expect(writeRequests).toBe(2);
  } finally {
    await page.unroute(`**/api/albums/${ALBUM_A}/items`);
  }
});
test("an earlier album addition cannot close a newer card tooltip", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": { ...saved, closeTooltipWhenAddedToAlbum: true },
    });
  });
  let release!: () => void, posted!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    posted = resolve;
  });
  await page.route(`**/api/albums/${ALBUM_A}/items`, async (route) => {
    writeRequests++;
    posted();
    await held;
    membership = true;
    await route.fulfill({ json: { added: 1 } });
  });
  try {
    await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
    await page.locator(".ko-grid-open").first().hover();
    const popup = page.locator("#kosmore-root");
    await popup
      .getByRole("button", { name: "Space & discovery", exact: true })
      .click();
    await ready;
    await page.keyboard.press("Escape");
    await page.locator(".ko-grid-open").nth(2).hover();
    await expect(popup.locator("h2")).toHaveText("Voyager 1");
    const confirmed = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/albums" &&
        new URL(response.url()).searchParams.get("contains") === "42",
    );
    release();
    await confirmed;
    await page.waitForTimeout(250);
    await expect(popup.locator("h2")).toHaveText("Voyager 1");
    expect(writeRequests).toBe(1);
  } finally {
    release();
    await page.unroute(`**/api/albums/${ALBUM_A}/items`);
  }
});
test("reveal popup controls do not advance a card; a repeated subject changes copy after the tray advances", async () => {
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}`);
  await page.locator(".kc-article").hover();
  let popup = page.locator("#kosmore-root");
  await expect(popup.getByLabel("Owned copy")).toHaveValue(COPY_A);
  await popup.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-advances", "0");
  await expect(popup.getByLabel("Owned copy")).toHaveValue(COPY_A);
  await page.locator(".kc-article").hover();
  await page.evaluate(() => {
    document.querySelectorAll(".ko-tray li")[1].classList.add("on");
  });
  popup = page.locator("#kosmore-root");
  await expect(popup.getByLabel("Owned copy")).toHaveValue(COPY_B);
  expect(writeRequests).toBe(0);
});
test("late responses never replace the currently hovered card", async () => {
  holdSlow = true;
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").first().hover();
  await expect(page.locator("#kosmore-root")).toBeVisible();
  await page.locator(".ko-grid-open").nth(3).hover();
  await expect(page.locator("#kosmore-root h2")).toHaveText("Andromeda");
  await expect(page.locator("#kosmore-root .subtitle")).toContainText("No. 46");
  await page.waitForTimeout(700);
  await expect(page.locator("#kosmore-root h2")).toHaveText("Andromeda");
});
test("a failed variant stays separate from empty history and does not disable album controls", async () => {
  variantFailure = true;
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").first().hover();
  const popup = page.locator("#kosmore-root");
  await expect(
    popup.locator(".error").filter({ hasText: "Shiny:" }),
  ).toBeVisible();
  await expect(
    popup.getByRole("button", { name: "Space & discovery", exact: true }),
  ).toBeEnabled();
  await expect(popup.locator(".stats")).toContainText("Full art");
  expect(writeRequests).toBe(0);
});
test("popup stays inside a narrow viewport and works above an open native dialog", async () => {
  await page.setViewportSize({ width: 650, height: 900 });
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.evaluate(() => {
    const d = document.createElement("dialog");
    d.className = "ko-viewer-sheet";
    d.innerHTML =
      '<p class="ko-viewer-count">1 OF 6</p>' +
      document.querySelector(".kc-article")!.outerHTML;
    document.body.append(d);
    d.showModal();
  });
  await page.locator("dialog .kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await expect(popup).toBeVisible();
  await expect(
    popup.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeEnabled();
  // Async sections resize the popup; allow its ResizeObserver to reposition it.
  await expect
    .poll(async () => {
      const box = await popup.boundingBox();
      return box!.y + box!.height;
    })
    .toBeLessThanOrEqual(900);
  const box = await popup.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(650);
  expect(box!.y + box!.height).toBeLessThanOrEqual(900);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(page.locator("dialog")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
});
test("settings groups are ordered with separate account controls and a fixed anchor navigation", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  await page.goto("https://kosmora.io/collection");
  const options = await context.newPage();
  try {
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(
      options.getByText("Connected to FixturePlayer.", { exact: true }),
    ).toBeVisible();
    expect(
      await options
        .locator("#app > section")
        .evaluateAll((sections) =>
          sections.map((section) => section.querySelector("h2")?.textContent),
        ),
    ).toEqual([
      "Hover tooltip",
      "Pinned albums",
      "Tooltip stat boxes",
      "Card overlays",
      "Friend tooltip",
      "Profile reminders",
      "Trade reminders",
      "Sales Overlay",
      "Navigation hotkeys",
      "Backup & restore",
      "Connected account",
    ]);
    const connection = options.locator("#connected-account"),
      albums = options.locator("#pinned-albums"),
      nav = options.getByRole("navigation", { name: "Settings groups" });
    await expect(nav.getByRole("link")).toHaveText([
      "Hover tooltip",
      "Pinned albums",
      "Tooltip stat boxes",
      "Card overlays",
      "Friend tooltip",
      "Profile reminders",
      "Trade reminders",
      "Sales Overlay",
      "Navigation hotkeys",
      "Backup & restore",
      "Connected account",
    ]);
    await expect(connection.getByLabel("Kosmora account")).toBeVisible();
    await expect(
      connection.locator(".album-list,.pin-list,.savebar"),
    ).toHaveCount(0);
    await expect(albums.getByLabel("Search albums")).toBeVisible();
    await expect(albums.locator(".album-account")).toContainText(
      "FixturePlayer",
    );
    for (const label of [
      "Enable navigation hotkey",
      "Enable card overlays",
      "Enable sales overlay",
      "Enable stat boxes",
      "Enable pinned albums",
    ])
      await expect(options.getByLabel(label, { exact: true })).toBeChecked();
    await expect(
      options.locator(".settings-group-heading").getByRole("switch"),
    ).toHaveCount(9);
    for (const name of [
      "Show Last Sale price",
      "Show Lowest Listed price",
      "Close Unpinned Tooltips When Added to Album",
    ])
      await expect(
        options.getByRole("checkbox", { name, exact: true }),
      ).toBeVisible();
    for (const name of [
      "Set price when Last Sale is clicked",
      "Set price when Lowest Listed is clicked",
      "Also Close Pinned Tooltips",
    ])
      await expect(
        options.getByRole("switch", { name, exact: true }),
      ).toBeVisible();
    const checkSwitchLayout = async () => {
      for (const input of await options
        .locator(".settings-group-heading")
        .getByRole("switch")
        .all()) {
        const alignment = await input.evaluate((input) => {
          const row = input.parentElement!.getBoundingClientRect(),
            control = input.getBoundingClientRect(),
            heading = input
              .parentElement!.querySelector("h2")!
              .getBoundingClientRect();
          return {
            right: Math.abs(row.right - control.right),
            vertical: Math.abs(
              row.y + row.height / 2 - (control.y + control.height / 2),
            ),
            overlap: heading.right > control.left,
          };
        });
        expect(alignment.right).toBeLessThanOrEqual(1);
        expect(alignment.vertical).toBeLessThanOrEqual(1);
        expect(alignment.overlap).toBe(false);
      }
    };
    await checkSwitchLayout();
    const initial = (await nav.boundingBox())!;
    for (const [label, id] of [
      ["Hover tooltip", "hover-tooltip"],
      ["Pinned albums", "pinned-albums"],
      ["Tooltip stat boxes", "stat-boxes"],
      ["Card overlays", "card-overlays"],
      ["Friend tooltip", "friend-tooltip"],
      ["Profile reminders", "profile-reminders"],
      ["Trade reminders", "trade-reminders"],
      ["Sales Overlay", "sales-overlay"],
      ["Navigation hotkeys", "navigation-hotkeys"],
      ["Backup & restore", "backup-restore"],
      ["Connected account", "connected-account"],
    ]) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(options).toHaveURL(new RegExp(`#${id}$`));
      await expect(options.locator(`#${id} h2`).first()).toBeInViewport();
      const now = (await nav.boundingBox())!;
      expect({ x: now.x, y: now.y }).toEqual({ x: initial.x, y: initial.y });
    }
    await options.screenshot({
      path: "test-results/screenshots/settings-account-bottom.png",
    });
    await nav.getByRole("link", { name: "Hover tooltip", exact: true }).click();
    await options.screenshot({
      path: "test-results/screenshots/settings-navigation-desktop.png",
    });
    for (const width of [640, 390]) {
      await options.setViewportSize({ width, height: 900 });
      await nav
        .getByRole("link", { name: "Navigation hotkeys", exact: true })
        .click();
      await expect(options.locator("#navigation-hotkeys h2")).toBeInViewport();
      await checkSwitchLayout();
      expect(
        await options.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const before = (await nav.boundingBox())!;
      await nav
        .getByRole("link", { name: "Connected account", exact: true })
        .click();
      await expect(options.locator("#connected-account > h2")).toBeInViewport();
      const after = (await nav.boundingBox())!;
      expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
      await nav
        .getByRole("link", { name: "Hover tooltip", exact: true })
        .click();
      await options.screenshot({
        path: `test-results/screenshots/settings-navigation-${width}.png`,
      });
    }
    expect(writeRequests).toBe(0);
  } finally {
    await options.close();
  }
});
test("feature switches save immediately and disabled settings groups are read-only", async () => {
  await page.goto("https://kosmora.io/collection");
  const options = await context.newPage();
  const groups = [
    [
      "hover-tooltip",
      "Enable card hover tooltips",
      "tooltip settings",
      "Hover delay",
    ],
    [
      "pinned-albums",
      "Enable pinned albums",
      "album shortcuts",
      "Search albums",
    ],
    ["stat-boxes", "Enable stat boxes", "stat layout", "Show Min Price"],
    [
      "friend-tooltip",
      "Enable friend tooltip",
      "friend tooltip settings",
      "Friend hover delay",
    ],
    [
      "profile-reminders",
      "Enable profile reminders",
      "profile reminder settings",
      "Keep reminders pinned on profiles",
    ],
    [
      "trade-reminders",
      "Enable trade reminders",
      "trade reminder settings",
      "Show possible interest counts",
    ],
    [
      "card-overlays",
      "Enable card overlays",
      "overlay settings",
      "Show sale history icon on cards",
    ],
    [
      "sales-overlay",
      "Enable sales overlay",
      "sales overlay settings",
      "Show Last Sale price",
    ],
    [
      "navigation-hotkeys",
      "Enable navigation hotkey",
      "hotkeys",
      "Set shortcut for Home",
    ],
  ];
  try {
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(
      options.getByText("Connected to FixturePlayer.", { exact: true }),
    ).toBeVisible();
    const checkDisabled = async (id: string) => {
      const group = options.locator(`#${id}`);
      await expect(group).toHaveClass(/settings-group-disabled/);
      await expect(group.locator(".settings-group-state")).toHaveText(
        "Disabled",
      );
      await expect(group.locator(".settings-group-state")).toBeVisible();
      await expect(
        group.locator(".settings-group-heading").getByRole("switch"),
      ).toBeEnabled();
      const controls = await group
        .locator("fieldset")
        .locator("input,button,select")
        .all();
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) await expect(control).toBeDisabled();
      for (const button of await group.locator(".savebar button").all())
        await expect(button).toBeDisabled();
    };
    for (const [id, label, name, editable] of groups) {
      const group = options.locator(`#${id}`);
      await group.getByRole("switch", { name: label, exact: true }).uncheck();
      await checkDisabled(id);
      await expect(group.getByRole("status")).toContainText("Saved.");
      await group.getByRole("switch", { name: label, exact: true }).check();
      await expect(group.getByLabel(editable, { exact: true })).toBeEnabled();
      await expect(group.locator(".settings-group-state")).toBeHidden();
      await group
        .getByRole("button", { name: `Cancel ${name} changes`, exact: true })
        .click();
      await expect(
        group.getByRole("switch", { name: label, exact: true }),
      ).toBeChecked();
      await group.getByRole("switch", { name: label, exact: true }).uncheck();
      await expect(group.getByRole("status")).toContainText("Saved.");
      await checkDisabled(id);
    }
    await options.reload();
    await expect(
      options.getByText("Connected to FixturePlayer.", { exact: true }),
    ).toBeVisible();
    // Account refresh rebuilds album buttons without making a disabled group editable.
    await options
      .getByRole("button", { name: "Refresh accounts", exact: true })
      .click();
    await expect(
      options.getByText("Connected to FixturePlayer.", { exact: true }),
    ).toBeVisible();
    for (const [id] of groups) await checkDisabled(id);
    await expect(options.getByLabel("Kosmora account")).toBeEnabled();
    await mkdir("test-results/screenshots", { recursive: true });
    await options
      .getByRole("link", { name: "Hover tooltip", exact: true })
      .click();
    await options.screenshot({
      path: "test-results/screenshots/settings-disabled-desktop.png",
    });
    await options.setViewportSize({ width: 390, height: 900 });
    await options.screenshot({
      path: "test-results/screenshots/settings-disabled-390.png",
    });
    expect(
      await options.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(writeRequests).toBe(0);
  } finally {
    await options.close();
  }
});
test("feature switches preserve drafts, recover from storage failures, and stay in sync across settings tabs", async () => {
  const options = await context.newPage(),
    other = await context.newPage();
  try {
    for (const tab of [options, other])
      await tab.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(
      options.getByLabel("Hover delay", { exact: true }),
    ).toHaveValue("100");
    const group = options.locator("#hover-tooltip"),
      toggle = group.getByRole("switch", {
        name: "Enable card hover tooltips",
        exact: true,
      });
    await options.getByLabel("Hover delay", { exact: true }).fill("");
    await options.getByLabel("Tooltip width", { exact: true }).fill("720");
    await toggle.uncheck();
    await expect(group.getByRole("status")).toContainText("Saved.");
    await expect(
      other.getByLabel("Enable card hover tooltips", { exact: true }),
    ).not.toBeChecked();
    await expect(
      other.getByRole("button", { name: "Save tooltip settings", exact: true }),
    ).toBeDisabled();
    const stored = await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ],
    );
    expect(stored).toMatchObject({
      enabled: false,
      hoverDelayMs: 100,
      popupWidth: 440,
    });
    await toggle.check();
    await expect(
      options.getByLabel("Hover delay", { exact: true }),
    ).toBeEnabled();
    await expect(
      options.getByLabel("Hover delay", { exact: true }),
    ).toHaveValue("");
    await expect(
      options.getByLabel("Tooltip width", { exact: true }),
    ).toHaveValue("720");
    await group
      .getByRole("button", {
        name: "Cancel tooltip settings changes",
        exact: true,
      })
      .click();
    await expect(toggle).toBeChecked();
    await expect(
      options.getByLabel("Hover delay", { exact: true }),
    ).toHaveValue("100");
    await expect(
      options.getByLabel("Tooltip width", { exact: true }),
    ).toHaveValue("440");
    await options.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      let fail = true;
      chrome.storage.local.set = ((items: Record<string, unknown>) => {
        if (fail) {
          fail = false;
          return Promise.reject(new Error("Fixture storage failure"));
        }
        return original(items);
      }) as typeof chrome.storage.local.set;
    });
    // A failed save restores the checked state before Playwright's uncheck assertion.
    await toggle.click();
    await expect(group.getByRole("status")).toContainText(
      "Could not save the feature switch",
    );
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeEnabled();
    await expect(
      group.getByRole("button", { name: "Save tooltip settings", exact: true }),
    ).toBeEnabled();
    await toggle.uncheck();
    await expect(group.getByRole("status")).toContainText("Saved.");
    await expect(toggle).not.toBeChecked();
  } finally {
    await options.close();
    await other.close();
  }
});

test("queued feature switches and group saves retain every change", async () => {
  const options = await context.newPage();
  try {
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(
      options.getByLabel("Hover delay", { exact: true }),
    ).toHaveValue("100");
    await options.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      const held = new Promise<void>((resolve) => {
        (
          window as unknown as { releaseSettingsWrite: () => void }
        ).releaseSettingsWrite = resolve;
      });
      chrome.storage.local.set = (async (items: Record<string, unknown>) => {
        await held;
        await original(items);
      }) as typeof chrome.storage.local.set;
    });
    const tooltip = options.locator("#hover-tooltip"),
      overlays = options.locator("#card-overlays"),
      sales = options.locator("#sales-overlay");
    await tooltip
      .getByRole("switch", { name: "Enable card hover tooltips", exact: true })
      .uncheck();
    await overlays
      .getByRole("switch", { name: "Enable card overlays", exact: true })
      .uncheck();
    await sales
      .getByLabel("Last Sale price adjustment", { exact: true })
      .fill("5");
    await sales
      .getByRole("button", { name: "Save sales overlay settings", exact: true })
      .click();
    await expect(
      tooltip.getByRole("switch", {
        name: "Enable card hover tooltips",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      overlays.getByRole("switch", {
        name: "Enable card overlays",
        exact: true,
      }),
    ).toBeDisabled();
    await options.evaluate(() =>
      (
        window as unknown as { releaseSettingsWrite: () => void }
      ).releaseSettingsWrite(),
    );
    for (const group of [tooltip, overlays, sales])
      await expect(group.getByRole("status")).toContainText("Saved.");
    expect(
      await worker.evaluate(
        async () =>
          (await chrome.storage.local.get("kosmore.settings"))[
            "kosmore.settings"
          ],
      ),
    ).toMatchObject({
      enabled: false,
      cardOverlaysEnabled: false,
      salesLastSaleAdjustment: 5,
    });
    await expect(
      tooltip.getByRole("button", {
        name: "Save tooltip settings",
        exact: true,
      }),
    ).toBeDisabled();
  } finally {
    await options.close();
  }
});

test("section enable settings apply live and preserve shortcuts, stat choices and pinned albums", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...saved,
        showSaleHistoryOverlay: true,
        hotkeys: {
          home: {
            code: "KeyH",
            alt: true,
            shift: true,
            ctrl: false,
            meta: false,
          },
        },
      },
    });
  });
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await expect(popup.locator(".metric")).toHaveCount(8);
  await expect(
    page.locator("[data-kosmore-card-overlays] .sale"),
  ).toBeVisible();
  await expect(popup.locator(".header-prices .sale")).toBeVisible();
  await popup.getByLabel("Owned copy").selectOption(COPY_A);
  const original = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as { hotkeys: unknown; pinnedAlbums: unknown; stats: unknown },
  );
  const options = await context.newPage();
  try {
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const set = async (label: string, group: string, on: boolean) => {
      await options.getByLabel(label, { exact: true }).setChecked(on);
      const section = options.getByRole("region", { name: group, exact: true });
      await expect(section.getByRole("status")).toContainText("Saved.");
    };
    await set("Enable navigation hotkey", "hotkeys", false);
    await set("Enable card overlays", "overlay settings", false);
    await expect(page.locator("[data-kosmore-card-overlays]")).toHaveCount(0);
    await expect(popup.locator(".header-signals .signal-badge")).toHaveCount(0);
    await set("Enable stat boxes", "stat layout", false);
    await expect(popup.locator(".metric")).toHaveCount(0);
    await expect(
      popup.getByRole("tab", { name: "Market", exact: true }),
    ).toBeVisible();
    await set("Enable pinned albums", "album shortcuts", false);
    await expect(popup.locator(".albums")).toHaveCount(0);
    await expect(
      popup.getByRole("heading", { name: "Pinned albums", exact: true }),
    ).toHaveCount(0);
    await expect(popup.getByLabel("Owned copy")).toHaveValue(COPY_A);
    await expect(
      popup.getByRole("button", { name: "Sell card", exact: true }),
    ).toBeEnabled();
    await page.locator("h1").click();
    await page.keyboard.press("Alt+Shift+H");
    await expect(page).toHaveURL("https://kosmora.io/collection");
    const disabled = await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ] as { hotkeys: unknown; pinnedAlbums: unknown; stats: unknown },
    );
    expect(disabled.hotkeys).toEqual(original.hotkeys);
    expect(disabled.stats).toEqual(original.stats);
    expect(disabled.pinnedAlbums).toEqual(original.pinnedAlbums);
    await options.getByLabel("Enable stat boxes", { exact: true }).check();
    await options
      .getByRole("button", { name: "Cancel stat layout changes", exact: true })
      .click();
    await expect(
      options.getByLabel("Enable stat boxes", { exact: true }),
    ).toBeChecked();
    await set("Enable stat boxes", "stat layout", false);
    await options.reload();
    for (const label of [
      "Enable navigation hotkey",
      "Enable card overlays",
      "Enable stat boxes",
      "Enable pinned albums",
    ])
      await expect(
        options.getByLabel(label, { exact: true }),
      ).not.toBeChecked();
    await expect(
      options.getByLabel("Show sale history icon on cards", { exact: true }),
    ).toBeChecked();
    await set("Enable stat boxes", "stat layout", true);
    await expect(popup.locator(".metric")).toHaveCount(8);
    await set("Enable card overlays", "overlay settings", true);
    await expect(
      page.locator("[data-kosmore-card-overlays] .sale"),
    ).toBeVisible();
    await expect(popup.locator(".header-signals .sale")).toHaveCount(0);
    await set("Enable pinned albums", "album shortcuts", true);
    await expect(popup.locator(".album-add")).toHaveCount(2);
    await expect(popup.getByLabel("Owned copy")).toHaveValue(COPY_A);
    await set("Enable navigation hotkey", "hotkeys", true);
    await page.locator("h1").click();
    await page.keyboard.press("Alt+Shift+H");
    await expect(page).toHaveURL("https://kosmora.io/home");
    expect(writeRequests).toBe(0);
  } finally {
    await options.close();
  }
});
test("options discovers the real content-script session, saves ordered pins and cancels drafts", async () => {
  await page.goto("https://kosmora.io/collection");
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(
    options.getByText("Connected to FixturePlayer.", { exact: true }),
  ).toBeVisible();
  await options
    .getByRole("button", { name: "Move up Favourites", exact: true })
    .click();
  await options
    .getByRole("button", { name: "Save album shortcuts", exact: true })
    .click();
  await expect(
    options
      .getByRole("region", { name: "album shortcuts", exact: true })
      .getByRole("status"),
  ).toContainText("Saved.");
  const pins = await worker.evaluate(
    async () =>
      (
        (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ] as { pinnedAlbums: Record<string, string[]> }
      ).pinnedAlbums.fixtureplayer,
  );
  expect(pins).toEqual([ALBUM_B, ALBUM_A]);
  await options.getByLabel("Hover delay", { exact: true }).fill("900");
  await options
    .getByRole("button", {
      name: "Cancel tooltip settings changes",
      exact: true,
    })
    .click();
  await expect(options.getByLabel("Hover delay", { exact: true })).toHaveValue(
    "100",
  );
  await options.screenshot({ path: "test-results/screenshots/options.png" });
  await options.close();
  expect(writeRequests).toBe(0);
});
test("unowned cards show insights but cannot submit an album write", async () => {
  inventoryEmpty = true;
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await expect(
    popup.getByText("Own a copy of this card to add it to an album.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(popup.locator(".stats")).toContainText("Standard");
  await expect(
    popup.getByRole("button", { name: "Sell card", exact: true }),
  ).toBeDisabled();
  expect(writeRequests).toBe(0);
});
test("replacing an anchor removes its popup and newly inserted cards work without reinitialization", async () => {
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  await expect(page.locator("#kosmore-root")).toBeVisible();
  await page.evaluate(() => {
    document.querySelector(".kc-article")!.remove();
  });
  await expect(page.locator("#kosmore-root")).toHaveCount(0);
  await page.evaluate(
    (html) => {
      document.querySelector("main")!.insertAdjacentHTML("beforeend", html);
    },
    face("46", "Andromeda"),
  );
  await page.locator(".kc-article").hover();
  await expect(page.locator("#kosmore-root h2")).toHaveText("Andromeda");
  expect(writeRequests).toBe(0);
});
test("disabling hover tooltips immediately closes an existing popup in an already-open tab", async () => {
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  await expect(page.locator("#kosmore-root")).toBeVisible();
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options
    .getByLabel("Enable card hover tooltips", { exact: true })
    .uncheck();
  await expect(
    options
      .getByRole("region", { name: "tooltip settings", exact: true })
      .getByRole("status"),
  ).toContainText("Saved.");
  await expect(page.locator("#kosmore-root")).toHaveCount(0);
  await options.close();
  expect(writeRequests).toBe(0);
});
test("Active Auctions counts exact-card listings, refreshes and keeps failures distinct from zero", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": { ...saved, showActiveAuctionsOverlay: true },
    });
  });
  let mode = "listed",
    reads = 0;
  await page.route("**/api/auctions?**", async (route) => {
    reads++;
    expect(route.request().method()).toBe("GET");
    expect(new URL(route.request().url()).searchParams.get("q")).toBe(
      "Northern Lights",
    );
    if (mode === "failed")
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
    else
      await route.fulfill({
        json: {
          items:
            mode === "empty"
              ? []
              : [
                  auction(1),
                  auction(2, "42", { veil: true }),
                  auction(3, "43"),
                  auction(4, "42", { state: "sold" }),
                  auction(5, "42", {
                    endsAt: new Date(Date.now() - 1000).toISOString(),
                  }),
                ],
          nextOffset: null,
          total: 5,
        },
      });
  });
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root"),
      metric = popup.locator('[data-stat-id="activeAuctions"]');
    await expect(metric.locator("strong")).toHaveText("2");
    await expect(popup.locator(".listed-for")).toContainText("Listed For: $");
    await expect(metric.locator("span")).toHaveText("Active Auctions");
    await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
    await popup.getByLabel("Shiny", { exact: true }).uncheck();
    await expect(metric.locator("strong")).toHaveText("2");
    expect(reads).toBe(1);
    const before = await popup.boundingBox();
    mode = "empty";
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(metric.locator("strong")).toHaveText("0");
    await expect(popup.locator(".header-signals .auction")).toHaveCount(0);
    mode = "failed";
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(metric.locator("strong")).toHaveText("—");
    await expect(metric).toHaveAttribute("title", /503/);
    await expect(popup.locator('[data-stat-id="interest"] strong')).toHaveText(
      "18",
    );
    mode = "listed";
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(metric.locator("strong")).toHaveText("2");
    expect(await popup.boundingBox()).toEqual(before);
    expect(reads).toBe(4);
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: "test-results/screenshots/active-auctions.png",
    });
    expect(writeRequests).toBe(0);
  } finally {
    await page.unroute("**/api/auctions?**");
  }
});
test("Active Auctions can be hidden and enabled in an open popup through stat settings", async () => {
  let reads = 0;
  await page.route("**/api/auctions?**", async (route) => {
    reads++;
    await route.fulfill({ json: auctionPage() });
  });
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...saved,
        stats: [{ id: "activeAuctions", enabled: false }],
      },
    });
  });
  const options = await context.newPage();
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root"),
      metric = popup.locator('[data-stat-id="activeAuctions"]');
    await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
    await expect(popup.locator('[data-stat-id="interest"] strong')).toHaveText(
      "18",
    );
    await expect(metric).toHaveCount(0);
    // The independent header fetches its price even while the metric is hidden.
    await expect(popup.locator(".listed-for")).toHaveText("Listed For: $10");
    expect(reads).toBe(1);
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByLabel("Show Active Auctions", { exact: true }).check();
    await options
      .getByRole("button", { name: "Save stat layout", exact: true })
      .click();
    await expect(metric.locator("strong")).toHaveText("2");
    await expect(popup.locator(".metric").first()).toHaveAttribute(
      "data-stat-id",
      "activeAuctions",
    );
    await options.getByLabel("Show Active Auctions", { exact: true }).uncheck();
    await options
      .getByRole("button", { name: "Save stat layout", exact: true })
      .click();
    await expect(metric).toHaveCount(0);
    expect(reads).toBe(1);
    expect(writeRequests).toBe(0);
  } finally {
    await options.close();
    await page.unroute("**/api/auctions?**");
  }
});
test("pinned albums precede stat boxes and market history", async () => {
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").first().hover();
  const popup = page.locator("#kosmore-root");
  await expect(
    popup.locator('.metric[data-stat-id$="Price"] strong'),
  ).toHaveText(["12", "18", "24"]);
  await expect(popup.locator('.metric[data-stat-id$="Price"] span')).toHaveText(
    ["Min Price", "Median Price", "Max Price"],
  );
  expect(
    await popup
      .locator(".body")
      .evaluate((body) => [...body.children].map((e) => e.className)),
  ).toEqual(["pinned-albums", "stat-area", "tab-workspace"]);
  await expect(popup.locator(".body + .footer")).toHaveCount(1);
  expect(
    await popup
      .locator(".stat-area")
      .evaluate((stats) => [...stats.children].map((e) => e.className)),
  ).toEqual([
    "metrics",
    "summary-label price-scope",
    "note error metric-error",
  ]);
  await expect(
    popup.getByRole("button", { name: "Sell card", exact: true }),
  ).toBeEnabled();
  await popup.evaluate((element) => {
    element.scrollTop = 0;
  });
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({ path: "test-results/screenshots/popup-updated.png" });
});
test("recent sales defaults to five and expands to every returned sale", async () => {
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").first().hover();
  const popup = page.locator("#kosmore-root");
  await expect(popup.locator(".sales li")).toHaveCount(5);
  const collapsed = await popup.boundingBox();
  await popup.getByRole("button", { name: "Show All", exact: true }).click();
  await expect(popup.locator(".sales li")).toHaveCount(6);
  const expanded = await popup.boundingBox();
  expect(expanded!.width).toBeCloseTo(collapsed!.width, 2);
  expect(expanded!.height).toBeCloseTo(collapsed!.height, 2);
  expect(expanded!.y + expanded!.height).toBeLessThanOrEqual(1000);
  await popup.getByRole("button", { name: "Show Less", exact: true }).click();
  await expect(popup.locator(".sales li")).toHaveCount(5);
  expect((await popup.boundingBox())!.height).toBeCloseTo(collapsed!.height, 2);
  expect(writeRequests).toBe(0);
});
test("popup dimensions stay fixed while data loads, filters hide content, and a new card opens", async () => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pause = async (route: Route) => {
    await ready;
    await route.fallback();
  };
  await page.route("**/api/**", pause);
  try {
    await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
    await page.locator(".ko-grid-open").first().hover();
    const popup = page.locator("#kosmore-root");
    await expect(popup).toBeVisible();
    const initial = await popup.boundingBox();
    expect(initial!.width).toBeCloseTo(440, 2);
    expect(initial!.height).toBeCloseTo(900, 2);
    release();
    await expect(popup.getByLabel("Owned copy")).toHaveValue(COPY_A);
    await expect(popup.locator(".sales li")).toHaveCount(5);
    const dimensions = async () => {
      return popup.evaluate((element) => ({
        width: (element as HTMLElement).offsetWidth,
        height: (element as HTMLElement).offsetHeight,
      }));
    };
    const expected = {
      width: Math.round(initial!.width),
      height: Math.round(initial!.height),
    };
    expect(await dimensions()).toEqual(expected);
    const bodyWidth = await popup
      .locator(".body")
      .evaluate((e) => e.clientWidth);
    for (const finish of ["Standard", "Shiny", "Full art"])
      await popup.getByLabel(finish, { exact: true }).uncheck();
    await expect(popup.locator(".sales li")).toHaveCount(0);
    expect(await dimensions()).toEqual(expected);
    expect(await popup.locator(".body").evaluate((e) => e.clientWidth)).toBe(
      bodyWidth,
    );
    await page.keyboard.press("Escape");
    await page.locator(".ko-grid-open").nth(3).hover();
    await expect(popup.locator("h2")).toHaveText("Andromeda");
    expect(await dimensions()).toEqual(expected);
    expect(writeRequests).toBe(0);
  } finally {
    release();
    await page.unroute("**/api/**", pause);
  }
});
test("variant checkboxes persist across popups and options saves without closing the current popup", async () => {
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").first().hover();
  const popup = page.locator("#kosmore-root");
  await popup.getByLabel("Shiny", { exact: true }).uncheck();
  await expect(popup).toBeVisible();
  await expect(popup.locator(".sales li")).toHaveCount(3);
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.storage.local.get("kosmore.marketFinishes"))[
            "kosmore.marketFinishes"
          ],
      ),
    )
    .toEqual(["plain", "fullart"]);
  await page.keyboard.press("Escape");
  await page.locator(".ko-grid-open").nth(3).hover();
  await expect(popup.getByLabel("Shiny", { exact: true })).not.toBeChecked();
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(
    options.getByText("Connected to FixturePlayer.", { exact: true }),
  ).toBeVisible();
  await options
    .getByRole("button", { name: "Save tooltip settings", exact: true })
    .click();
  await options.close();
  await page.locator(".ko-grid-open").nth(3).hover();
  await expect(popup.getByLabel("Shiny", { exact: true })).not.toBeChecked();
});
test("the gavel opens the native sell form for the exact recap copy without submitting a sale", async () => {
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").nth(1).hover();
  const popup = page.locator("#kosmore-root");
  await expect(popup.getByLabel("Owned copy")).toHaveValue(COPY_B);
  await popup.getByRole("button", { name: "Sell card", exact: true }).click();
  await expect(page).toHaveURL(
    `https://kosmora.io/market/sell?subject=42&instance=${COPY_B}`,
  );
  expect(writeRequests).toBe(0);
});
test("the gavel requires copy selection when ambiguous even without pinned albums", async () => {
  await worker.evaluate(async () => {
    const s = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as { pinnedAlbums: Record<string, string[]> };
    s.pinnedAlbums.fixtureplayer = [];
    await chrome.storage.local.set({ "kosmore.settings": s });
  });
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await expect(
    popup.getByRole("button", { name: "Sell card", exact: true }),
  ).toBeDisabled();
  await popup.getByLabel("Owned copy").selectOption(COPY_A);
  await expect(
    popup.getByRole("button", { name: "Sell card", exact: true }),
  ).toBeEnabled();
  await popup.getByRole("button", { name: "Sell card", exact: true }).click();
  await expect(page).toHaveURL(
    `https://kosmora.io/market/sell?subject=42&instance=${COPY_A}`,
  );
  expect(writeRequests).toBe(0);
});
test("closing the popup after pressing the gavel still opens sale details", async () => {
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").nth(1).hover();
  const popup = page.locator("#kosmore-root");
  const sell = popup.getByRole("button", { name: "Sell card", exact: true });
  await expect(sell).toBeEnabled();
  holdSlow = true;
  const verification = page.waitForRequest("**/api/collection/42");
  await sell.click();
  await verification;
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(page).toHaveURL(
    `https://kosmora.io/market/sell?subject=42&instance=${COPY_B}`,
  );
  expect(writeRequests).toBe(0);
});
test("pending sell navigation does not override another page the user opens", async () => {
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").nth(1).hover();
  const sell = page
    .locator("#kosmore-root")
    .getByRole("button", { name: "Sell card", exact: true });
  await expect(sell).toBeEnabled();
  holdSlow = true;
  const verification = page.waitForResponse("**/api/collection/42");
  await sell.click();
  // Exercise same-document navigation: the content script remains alive.
  await page.evaluate(() => {
    history.pushState({}, "", "/collection");
  });
  await verification;
  await page.waitForTimeout(100);
  await expect(page).toHaveURL("https://kosmora.io/collection");
  expect(writeRequests).toBe(0);
});
test("friend notes and family tokens save locally below the native panel and survive reload", async () => {
  await page.goto("https://kosmora.io/social?f=batu");
  const editor = page.locator("#kosmore-friend-reminders");
  await expect(editor.getByLabel("Notes", { exact: true })).toBeEnabled();
  await expect(editor.locator("h2")).toHaveText("batu");
  expect(
    await editor
      .locator(".section")
      .evaluateAll((sections) =>
        sections.map((s) => s.querySelector("h3")?.textContent),
      ),
  ).toEqual(["Families they like", "Notes"]);
  expect(
    await editor.evaluate((e) =>
      e.previousElementSibling?.getAttribute("data-testid"),
    ),
  ).toBe("sb-friend-card");
  await editor
    .getByLabel("Notes", { exact: true })
    .fill("Prefers ships. Ask before sending duplicates.");
  const families = editor.getByLabel("Families they like", { exact: true });
  await families.fill("Ships and Boats");
  await families.press("Enter");
  await families.fill("Fish");
  await families.press("Enter");
  await families.fill("fish");
  await editor.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    editor.getByRole("list", { name: "Preferred families" }).locator("li"),
  ).toHaveCount(2);
  await editor
    .getByRole("button", { name: "Save reminders", exact: true })
    .click();
  await expect(editor.getByRole("status")).toHaveText("Saved locally");
  expect(
    await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.friend.fixtureplayer.batu"))[
          "kosmore.friend.fixtureplayer.batu"
        ],
    ),
  ).toEqual({
    schemaVersion: 1,
    notes: "Prefers ships. Ask before sending duplicates.",
    families: ["Ships and Boats", "Fish"],
  });
  await editor.getByLabel("Notes", { exact: true }).fill("Discard this edit");
  await editor
    .getByRole("button", { name: "Remove family Fish", exact: true })
    .click();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor.getByLabel("Notes", { exact: true })).toHaveValue(
    "Prefers ships. Ask before sending duplicates.",
  );
  await expect(
    editor.getByRole("button", { name: "Remove family Fish", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(editor.getByLabel("Notes", { exact: true })).toHaveValue(
    "Prefers ships. Ask before sending duplicates.",
  );
  await expect(
    editor.getByRole("button", {
      name: "Remove family Ships and Boats",
      exact: true,
    }),
  ).toBeVisible();
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/screenshots/friend-reminders.png",
    fullPage: true,
  });
  await expect(page.locator("body")).toHaveAttribute("data-native-action", "");
  expect(writeRequests).toBe(0);
});
test("reminders follow friend selection and remain separate between signed-in accounts", async () => {
  await page.goto("https://kosmora.io/social");
  const editor = page.locator("#kosmore-friend-reminders");
  const notes = editor.getByLabel("Notes", { exact: true });
  await expect(notes).toBeEnabled();
  await notes.fill("Batu reminder");
  await editor
    .getByRole("button", { name: "Save reminders", exact: true })
    .click();
  await expect(editor.getByRole("status")).toHaveText("Saved locally");
  await page.locator('[data-friend="FriendB"]').click();
  await expect(
    editor.getByRole("heading", { name: "FriendB", exact: true }),
  ).toBeVisible();
  await expect(notes).toBeEnabled();
  await expect(notes).toHaveValue("");
  await notes.fill("Other friend reminder");
  await editor
    .getByRole("button", { name: "Save reminders", exact: true })
    .click();
  await expect(editor.getByRole("status")).toHaveText("Saved locally");
  await page.locator('[data-friend="batu"]').click();
  await expect(notes).toHaveValue("Batu reminder");
  account = "OtherPlayer";
  await page.evaluate(() => {
    document.querySelector(".rail a")!.setAttribute("href", "/u/OtherPlayer");
  });
  await expect(notes).toHaveValue("");
  await expect(notes).toBeEnabled();
  await notes.fill("Different account reminder");
  await editor
    .getByRole("button", { name: "Save reminders", exact: true })
    .click();
  await expect(editor.getByRole("status")).toHaveText("Saved locally");
  account = "FixturePlayer";
  await page.evaluate(() => {
    document.querySelector(".rail a")!.setAttribute("href", "/u/FixturePlayer");
  });
  await expect(notes).toHaveValue("Batu reminder");
  expect(
    await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.friend.otherplayer.batu"))[
          "kosmore.friend.otherplayer.batu"
        ],
    ),
  ).toMatchObject({ notes: "Different account reminder" });
  expect(writeRequests).toBe(0);
});
test("a save after an account change cannot put a draft into either account's reminders", async () => {
  await page.goto("https://kosmora.io/social?f=batu");
  const editor = page.locator("#kosmore-friend-reminders");
  const notes = editor.getByLabel("Notes", { exact: true });
  await expect(notes).toBeEnabled();
  await notes.fill("Do not save across accounts");
  account = "OtherPlayer";
  await editor
    .getByRole("button", { name: "Save reminders", exact: true })
    .click();
  await expect(editor.getByRole("status")).toContainText(
    "Your account is changing",
  );
  await expect(notes).toBeDisabled();
  expect(
    await worker.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)).filter((k) =>
        k.startsWith("kosmore.friend."),
      ),
    ),
  ).toEqual([]);
  expect(writeRequests).toBe(0);
});
test("reminders receive other-tab saves while preserving an unsaved local draft", async () => {
  await page.goto("https://kosmora.io/social?f=batu");
  const editor = page.locator("#kosmore-friend-reminders");
  const notes = editor.getByLabel("Notes", { exact: true });
  await expect(notes).toBeEnabled();
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "From another tab",
        families: ["Fish"],
      },
    });
  });
  await expect(notes).toHaveValue("From another tab");
  await notes.fill("My unsaved draft");
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "Newer remote edit",
        families: ["Ships and Boats"],
      },
    });
  });
  await expect(editor.getByRole("status")).toContainText(
    "Updated in another tab",
  );
  await expect(notes).toHaveValue("My unsaved draft");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(notes).toHaveValue("Newer remote edit");
  await expect(
    editor.getByRole("button", {
      name: "Remove family Ships and Boats",
      exact: true,
    }),
  ).toBeVisible();
  expect(writeRequests).toBe(0);
});
test("a delayed account read never populates a different friend's editor", async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "Batu only",
        families: [],
      },
      "kosmore.friend.fixtureplayer.friendb": {
        schemaVersion: 1,
        notes: "FriendB only",
        families: [],
      },
    });
  });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  const pause = async (route: Route) => {
    if (!held) {
      held = true;
      await ready;
    }
    await route.fallback();
  };
  await page.route("**/api/me", pause);
  try {
    await page.goto("https://kosmora.io/social?f=batu");
    const editor = page.locator("#kosmore-friend-reminders");
    await expect(editor.getByLabel("Notes", { exact: true })).toBeDisabled();
    await page.locator('[data-friend="FriendB"]').click();
    await expect(editor.getByLabel("Notes", { exact: true })).toHaveValue(
      "FriendB only",
    );
    release();
    await expect(
      editor.getByRole("heading", { name: "FriendB", exact: true }),
    ).toBeVisible();
    await expect(editor.getByLabel("Notes", { exact: true })).toHaveValue(
      "FriendB only",
    );
  } finally {
    release();
    await page.unroute("**/api/me", pause);
  }
  expect(writeRequests).toBe(0);
});
test("reminders stay within a narrow screen and disappear on other social subpages", async () => {
  await page.setViewportSize({ width: 650, height: 900 });
  try {
    await page.goto("https://kosmora.io/social?f=batu");
    const editor = page.locator("#kosmore-friend-reminders");
    await expect(editor.getByLabel("Notes", { exact: true })).toBeEnabled();
    const box = await editor.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(650);
    await page.evaluate(() => {
      history.pushState({}, "", "/social?v=give&f=batu");
      document
        .querySelector(".sb-side")!
        .setAttribute("class", "sb-side giving");
    });
    await expect(editor).toHaveCount(0);
    await page.evaluate(() => {
      history.pushState({}, "", "/social?f=batu");
      document.querySelector(".sb-side")!.setAttribute("class", "sb-side");
    });
    await expect(editor).toHaveCount(1);
    expect(writeRequests).toBe(0);
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});
test("family search accepts only catalog choices and preserves commas in names", async () => {
  await page.goto("https://kosmora.io/social?f=batu");
  const editor = page.locator("#kosmore-friend-reminders");
  const family = editor.getByRole("combobox", {
    name: "Families they like",
    exact: true,
  });
  await family.fill("Invented invalid family");
  await editor.getByRole("button", { name: "Add", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText(
    "Choose a valid family",
  );
  await expect(editor.locator(".tokens li")).toHaveCount(0);
  await family.fill("ducks");
  await expect(
    editor.getByRole("option", {
      name: "Ducks, Geese and Swans · Animals",
      exact: true,
    }),
  ).toBeVisible();
  await family.press("ArrowDown");
  await family.press("Enter");
  await editor
    .getByRole("button", { name: "Save reminders", exact: true })
    .click();
  await expect(editor.getByRole("status")).toHaveText("Saved locally");
  await page.reload();
  await expect(
    editor.getByRole("button", {
      name: "Remove family Ducks, Geese and Swans",
      exact: true,
    }),
  ).toBeVisible();
  await family.fill("cinema");
  await editor
    .getByRole("option", { name: "Cinéma · Arts", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Remove family Cinéma", exact: true }),
  ).toBeVisible();
  expect(writeRequests).toBe(0);
});
test("a catalog failure preserves old tokens and notes remain editable while retry restores choices", async () => {
  familyCatalogFailure = true;
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "Keep this",
        families: ["Previously entered family"],
      },
    });
  });
  await page.goto("https://kosmora.io/social?f=batu");
  const editor = page.locator("#kosmore-friend-reminders");
  await expect(editor.getByText(/Family list unavailable/)).toBeVisible();
  await expect(
    editor.getByRole("combobox", { name: "Families they like", exact: true }),
  ).toBeDisabled();
  await expect(
    editor.getByRole("button", {
      name: "Remove family Previously entered family",
      exact: true,
    }),
  ).toBeVisible();
  await editor
    .getByLabel("Notes", { exact: true })
    .fill("Notes can still save");
  await editor
    .getByRole("button", { name: "Save reminders", exact: true })
    .click();
  await expect(editor.getByRole("status")).toHaveText("Saved locally");
  familyCatalogFailure = false;
  await editor
    .getByRole("button", { name: "Retry families", exact: true })
    .click();
  await expect(
    editor.getByRole("combobox", { name: "Families they like", exact: true }),
  ).toBeEnabled();
  await expect(
    editor.getByRole("button", {
      name: "Remove family Previously entered family",
      exact: true,
    }),
  ).toBeVisible();
  expect(writeRequests).toBe(0);
});
test("Market is selected by default and Trade matches only current friends' saved families", async () => {
  await worker.evaluate(async () => {
    const r = (families: string[]) => ({
      schemaVersion: 1,
      notes: "private",
      families,
    });
    await chrome.storage.local.set({
      "kosmore.friend.fixtureplayer.batu": r(["Astronomy"]),
      "kosmore.friend.fixtureplayer.friendb": r([
        "Astronomy",
        "Space Exploration",
      ]),
      "kosmore.friend.otherplayer.nomatch": r(["Astronomy"]),
      "kosmore.friend.fixtureplayer.formerfriend": r(["Astronomy"]),
    });
  });
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await expect(
    popup.getByRole("tab", { name: "Market", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const before = await popup.evaluate((e) => ({
    width: (e as HTMLElement).offsetWidth,
    height: (e as HTMLElement).offsetHeight,
  }));
  await popup
    .getByRole("tab", { name: "Market", exact: true })
    .press("ArrowRight");
  await expect(
    popup.getByRole("tab", { name: "My listing history", exact: true }),
  ).toBeFocused();
  await popup
    .getByRole("tab", { name: "My listing history", exact: true })
    .press("ArrowRight");
  await expect(
    popup.getByRole("tab", { name: "Trade", exact: true }),
  ).toBeFocused();
  await expect(
    popup
      .getByRole("list", { name: "Matching friends", exact: true })
      .locator(".friend-name"),
  ).toHaveText(["FriendB", "batu"]);
  await expect(
    popup.getByRole("tabpanel", { name: "Market", exact: true }),
  ).toBeHidden();
  expect(
    await popup.evaluate((e) => ({
      width: (e as HTMLElement).offsetWidth,
      height: (e as HTMLElement).offsetHeight,
    })),
  ).toEqual(before);
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "private",
        families: [],
      },
    });
  });
  await expect(
    popup
      .getByRole("list", { name: "Matching friends", exact: true })
      .locator(".friend-name"),
  ).toHaveText(["FriendB"]);
  await popup.getByRole("tab", { name: "Trade", exact: true }).press("Home");
  await expect(
    popup.getByRole("tabpanel", { name: "Market", exact: true }),
  ).toBeVisible();
  await expect(popup.locator(".sales li")).toHaveCount(5);
  expect(writeRequests).toBe(0);
});
test("my listing history loads only on demand, keeps native newest order, refreshes and remembers its tab", async () => {
  let reads = 0,
    latest = "17000000";
  await page.route("**/api/me/auctions?**", (route) => {
    reads++;
    return route.fulfill({
      json: myListingPage([
        myListing(80, "42", {
          startPrice: latest,
          group: "sold",
          state: "sold",
          finalPrice: "99000000",
          veil: true,
        }),
        myListing(81, "46"),
        myListing(82, "42", {
          endsAt: "2026-11-01T10:20:00.000Z",
          startPrice: "11000000",
        }),
      ]),
    });
  });
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root");
    await expect(popup.locator(".metric").first()).toBeVisible();
    expect(reads).toBe(0);
    expect(
      await popup
        .getByRole("tab")
        .evaluateAll((tabs) =>
          tabs.map((tab) => tab.getAttribute("aria-label")),
        ),
    ).toEqual(["Market", "My listing history", "Trade", "Notes"]);
    await popup
      .getByRole("tab", { name: "My listing history", exact: true })
      .click();
    const list = popup.getByRole("list", {
      name: "My previous listings",
      exact: true,
    });
    await expect(list.locator("b")).toHaveText(["$17", "$11"]);
    await expect(list.locator("time").first()).toHaveAttribute(
      "datetime",
      "2026-11-06T16:15:30.000Z",
    );
    expect(reads).toBe(1);
    latest = "19000000";
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(list.locator("b").first()).toHaveText("$19");
    expect(reads).toBe(2);
    await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
    await worker.evaluate(async () => {
      const saved = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as object;
      await chrome.storage.local.set({
        "kosmore.settings": {
          ...saved,
          statBoxesEnabled: false,
          pinnedAlbumsEnabled: false,
        },
      });
    });
    await mkdir("test-results/screenshots", { recursive: true });
    for (const width of [440, 320]) {
      await worker.evaluate(async (popupWidth) => {
        const saved = (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ] as object;
        await chrome.storage.local.set({
          "kosmore.settings": { ...saved, popupWidth },
        });
      }, width);
      await expect
        .poll(async () => (await popup.boundingBox())?.width)
        .toBe(width);
      const left = (await list.locator("time").first().boundingBox())!,
        right = (await list.locator("b").first().boundingBox())!;
      expect(left.x + left.width).toBeLessThanOrEqual(right.x);
      await popup.screenshot({
        path: `test-results/screenshots/my-listing-history-${width}.png`,
      });
    }
    await page.reload();
    await page.locator(".kc-article").hover();
    await expect(
      popup.getByRole("tab", { name: "My listing history", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(list.locator("b")).toHaveText(["$19", "$11"]);
    expect(writeRequests).toBe(0);
  } finally {
    await page.unroute("**/api/me/auctions?**");
  }
});

test("listing performance: history fetches one batch only while selected and loads older matches on demand", async () => {
  const limits: number[] = [];
  const all = Array.from({ length: 151 }, (_, i) =>
    myListing(1000 + i, i === 100 ? "42" : "46"),
  );
  await page.route("**/api/me/auctions?**", (route) => {
    const n = Number(new URL(route.request().url()).searchParams.get("unsold"));
    limits.push(n);
    return route.fulfill({
      json: {
        ...myListingPage(all.slice(0, n)),
        groups: { selling: 0, sold: 0, unsold: all.length },
      },
    });
  });
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root"),
      history = popup.getByRole("tab", {
        name: "My listing history",
        exact: true,
      });
    await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    expect(limits).toEqual([]);
    await history.click();
    const more = popup.getByRole("button", { name: "Load more", exact: true });
    await expect(more).toBeEnabled();
    await expect(
      popup.getByText(
        "No matching listings in this batch. Older listings may still be available.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      popup.getByText("You haven't listed this card yet.", { exact: true }),
    ).toHaveCount(0);
    expect(limits).toEqual([50]);
    await mkdir("test-results/screenshots", { recursive: true });
    await popup.screenshot({
      path: "test-results/screenshots/listing-history-incomplete.png",
    });
    await more.click();
    await expect(more).toBeEnabled();
    expect(limits).toEqual([50, 100]);
    await popup.getByRole("tab", { name: "Market", exact: true }).click();
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await history.click();
    await expect(more).toBeEnabled();
    expect(limits).toEqual([50, 100]);
    await more.click();
    await expect(popup.locator(".my-listing b")).toHaveText("$17");
    expect(limits).toEqual([50, 100, 151]);
    await expect(more).toHaveCount(0);
    await mkdir("test-results/screenshots", { recursive: true });
    await popup.screenshot({
      path: "test-results/screenshots/listing-history-demand.png",
    });
    await page.reload();
    await page.locator(".kc-article").hover();
    await expect(popup.locator(".my-listing b")).toHaveText("$17");
    expect(limits).toHaveLength(3);
  } finally {
    await page.unroute("**/api/me/auctions?**");
  }
});

test("listing performance: leaving History cancels its fetch and preserves already loaded coverage", async () => {
  let reads = 0,
    release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const all = Array.from({ length: 150 }, (_, i) => myListing(2000 + i));
  await page.route("**/api/me/auctions?**", async (route) => {
    reads++;
    const n = Number(new URL(route.request().url()).searchParams.get("unsold"));
    if (reads === 2) await held;
    await route
      .fulfill({
        json: {
          ...myListingPage(all.slice(0, n)),
          groups: { selling: 0, sold: 0, unsold: 150 },
        },
      })
      .catch(() => {});
  });
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root"),
      history = popup.getByRole("tab", {
        name: "My listing history",
        exact: true,
      });
    await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
    await history.click();
    await expect(popup.locator(".my-listing")).toHaveCount(50);
    const failed = page.waitForEvent(
      "requestfailed",
      (request) => new URL(request.url()).pathname === "/api/me/auctions",
    );
    await popup.getByRole("button", { name: "Load more", exact: true }).click();
    await expect.poll(() => reads).toBe(2);
    await popup.getByRole("tab", { name: "Market", exact: true }).click();
    await failed;
    release();
    await history.click();
    await expect(popup.locator(".my-listing")).toHaveCount(50);
    expect(reads).toBe(2);
    await popup.getByRole("button", { name: "Load more", exact: true }).click();
    await expect(popup.locator(".my-listing")).toHaveCount(100);
    expect(reads).toBe(3);
  } finally {
    release();
    await page.unroute("**/api/me/auctions?**");
  }
});

test("listing performance: concurrent game tabs share their in-flight history request", async () => {
  let reads = 0,
    release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route("**/api/me/auctions?**", async (route) => {
    reads++;
    await held;
    await route
      .fulfill({ json: myListingPage([myListing(3000)]) })
      .catch(() => {});
  });
  const other = await context.newPage();
  try {
    for (const target of [page, other]) {
      await target.goto("https://kosmora.io/collection");
      await target.locator(".kc-article").hover();
      const popup = target.locator("#kosmore-root");
      await popup
        .getByRole("button", { name: "Pin popup", exact: true })
        .click();
      await popup
        .getByRole("tab", { name: "My listing history", exact: true })
        .click();
    }
    await expect.poll(() => reads).toBe(1);
    await page
      .locator("#kosmore-root")
      .getByRole("tab", { name: "Market", exact: true })
      .click();
    release();
    await expect(other.locator("#kosmore-root .my-listing b")).toHaveText(
      "$17",
    );
    expect(reads).toBe(1);
  } finally {
    release();
    await other.close();
    await context.unroute("**/api/me/auctions?**");
  }
});

test("my listing history keeps unavailable and empty states distinct and retries without exposing partial results", async () => {
  let fail = true;
  await page.route("**/api/me/auctions?**", (route) =>
    fail
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: myListingPage() }),
  );
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root");
    await popup
      .getByRole("tab", { name: "My listing history", exact: true })
      .click();
    await expect(
      popup.getByRole("button", { name: "Retry listing history", exact: true }),
    ).toBeVisible();
    await expect(popup.locator(".my-listing")).toHaveCount(0);
    fail = false;
    await popup
      .getByRole("button", { name: "Retry listing history", exact: true })
      .click();
    await expect(
      popup.getByText("You haven't listed this card yet.", { exact: true }),
    ).toBeVisible();
  } finally {
    await page.unroute("**/api/me/auctions?**");
  }
});

test("Trade has an empty state when no current friend's saved families match", async () => {
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("tab", { name: "Trade", exact: true }).click();
  await expect(
    popup.getByText(
      "No saved family preferences for your current friends yet.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    popup.getByRole("link", {
      name: "Edit friends' family preferences on Social",
      exact: true,
    }),
  ).toHaveAttribute("href", "/social");
  expect(writeRequests).toBe(0);
});
test("a failed friend read leaves the Market tab usable and offers Retry", async () => {
  await page.route("**/api/friends", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root");
    await popup.getByRole("tab", { name: "Trade", exact: true }).click();
    await expect(
      popup.getByRole("button", { name: "Retry matches", exact: true }),
    ).toBeVisible();
    await popup.getByRole("tab", { name: "Market", exact: true }).click();
    await expect(popup.locator(".sales li")).toHaveCount(5);
    expect(writeRequests).toBe(0);
  } finally {
    await page.unroute("**/api/friends");
  }
});
test("card notes persist per subject while switching tabs never resizes the popup", async () => {
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  const dimensions = () =>
    popup.evaluate((e) => ({
      width: (e as HTMLElement).offsetWidth,
      height: (e as HTMLElement).offsetHeight,
    }));
  await expect(
    popup.getByRole("tab", { name: "Market", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await popup.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const size = await dimensions();
  const commonPosition = () =>
    popup.locator(".stat-area").evaluate((e) => e.getBoundingClientRect().y);
  const statsY = await commonPosition();
  await popup.locator(".tab-content").evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  expect(await commonPosition()).toBe(statsY);
  expect(
    await popup
      .locator(".tab-content")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  expect(
    await popup.locator(".tabs").evaluate((e) => e.getBoundingClientRect().y),
  ).toBeGreaterThan(
    await popup
      .locator(".pinned-albums")
      .evaluate((e) => e.getBoundingClientRect().bottom),
  );
  await popup.getByRole("tab", { name: "Market", exact: true }).press("End");
  await expect(
    popup.getByRole("tab", { name: "Notes", exact: true }),
  ).toBeFocused();
  const input = popup.getByRole("textbox", { name: "Card notes", exact: true });
  await input.fill("Keep one copy for trading.");
  await popup.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(popup.getByRole("status")).toHaveText("Saved locally");
  expect(await dimensions()).toEqual(size);
  expect(await commonPosition()).toBe(statsY);
  await page.keyboard.press("Escape");
  await page.locator(".kc-article").hover();
  await popup.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(input).toHaveValue("Keep one copy for trading.");
  expect(writeRequests).toBe(0);
});
test("card market indicators remain independent while tooltip headers use price badges", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...saved,
        showActiveAuctionsOverlay: true,
        showSaleHistoryOverlay: true,
      },
    });
  });
  await page.route("**/api/auctions?**", (route) =>
    route.fulfill({
      json: {
        items: [auction(1), auction(2, "46")],
        nextOffset: null,
        total: 2,
      },
    }),
  );
  await page.route("**/api/cards/*/prices?**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    return route.fulfill({ json: prices(id === "43" || id === "46" ? 3 : 0) });
  });
  try {
    await page.goto("https://kosmora.io/collection");
    await page.evaluate(
      (html) => {
        document.querySelector("main")!.innerHTML = html;
      },
      '<h1>Market badges</h1><div style="display:grid;grid-template-columns:repeat(4,160px);gap:20px">' +
        [
          ["42", "Auctions only"],
          ["43", "History only"],
          ["46", "Both signals"],
          ["47", "Neither signal"],
        ]
          .map(
            ([id, name]) =>
              `<a id="card-${id}" href="/card/${id}" style="display:block;color:inherit;text-decoration:none">${face(id, name)}</a>`,
          )
          .join("") +
        "</div>",
    );
    const popup = page.locator("#kosmore-root");
    for (const [id, auctions, history] of [
      ["42", true, false],
      ["43", false, true],
      ["46", true, true],
      ["47", false, false],
    ] as const) {
      const card = page.locator(`#card-${id}`);
      await card.hover();
      await expect(popup.locator("h2")).toHaveText(
        await card.locator(".kc-name").innerText(),
      );
      await expect(
        card.locator("[data-kosmore-card-overlays] .auction"),
      ).toHaveCount(auctions ? 1 : 0);
      await expect(
        card.locator("[data-kosmore-card-overlays] .sale"),
      ).toHaveCount(history ? 1 : 0);
      await expect(
        popup.locator(".header-signals .auction,.header-signals .sale"),
      ).toHaveCount(0);
      await expect(popup.locator(".last-sold")).toHaveText(
        history ? "Last Sale: $12.00" : "Last Sale: No sales",
      );
      await expect(popup.locator(".listed-for")).toHaveText(
        auctions ? "Listed For: $10" : "Listed For: —",
      );
      await page.keyboard.press("Escape");
      await page.mouse.move(10, 10);
    }
    await page.locator("#card-46").hover();
    await expect(popup.locator(".header-prices .sale")).toBeVisible();
    await expect(popup.locator(".header-prices .auction")).toBeVisible();
    const paths = await popup
      .locator(".header-prices svg path")
      .evaluateAll((elements) => elements.map((e) => e.getAttribute("d")));
    expect(new Set(paths).size).toBe(2);
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: "test-results/screenshots/auction-history-badges.png",
    });
    expect(writeRequests).toBe(0);
  } finally {
    await page.unroute("**/api/auctions?**");
    await page.unroute("**/api/cards/*/prices?**");
  }
});
test("For Sale marks only your listed cards on the left, stays aligned and honors overlay settings", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...saved,
        showOnSaleOverlay: true,
        showSaleHistoryOverlay: true,
        showActiveAuctionsOverlay: true,
        showFriendInterestOverlay: true,
        showQuestOverlay: true,
      },
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "",
        families: ["Astronomy"],
      },
    });
  });
  await page.route("**/api/collection/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const source = card(id);
    await route.fulfill({
      json: {
        ...source,
        copies:
          id === "42"
            ? [
                {
                  ...source.copies[0],
                  state: "escrow",
                  auction_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                },
              ]
            : source.copies,
      },
    });
  });
  const options = await context.newPage();
  try {
    await page.goto("https://kosmora.io/collection");
    await page.evaluate(
      (html) => {
        document.querySelector("main")!.innerHTML = html;
      },
      '<h1>For Sale overlay</h1><div style="display:flex;gap:20px">' +
        ["42", "43"]
          .map(
            (id) =>
              `<a id="card-${id}" href="/card/${id}" style="display:block;width:200px">${face(id)}</a>`,
          )
          .join("") +
        "</div>",
    );
    const own = page.locator("#card-42"),
      label = own.locator("[data-kosmore-card-overlays] .on-sale");
    await expect(label).toHaveText("For Sale");
    await expect(label).toHaveAttribute(
      "aria-label",
      "You have this card for sale on the market",
    );
    await expect(
      own.locator("[data-kosmore-card-overlays] .signal-badge"),
    ).toHaveCount(4);
    await expect(
      page.locator("#card-43 [data-kosmore-card-overlays] .auction"),
    ).toBeVisible();
    await expect(
      page.locator("#card-43 [data-kosmore-card-overlays] .on-sale"),
    ).toHaveCount(0);
    const checkAlignment = async () => {
      const bounds = (await own
          .locator("[data-kosmore-card-overlays]")
          .boundingBox())!,
        sale = (await label.boundingBox())!,
        icons = await own
          .locator("[data-kosmore-card-overlays] .top-row .signal-badge")
          .all();
      expect(Math.abs(sale.x - bounds.x)).toBeLessThanOrEqual(1);
      for (const icon of icons) {
        const box = (await icon.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
        expect(box.y).toBeGreaterThanOrEqual(bounds.y);
        expect(box.y + box.height).toBeLessThan(bounds.y + bounds.height / 2);
        if (box.y < sale.y + sale.height)
          expect(box.x).toBeGreaterThanOrEqual(sale.x + sale.width + 3);
      }
      expect(
        await own
          .locator(".top-row .signal-badge")
          .evaluateAll((badges) =>
            badges.map((b) =>
              [...b.classList].find((c) =>
                ["quest", "sale", "auction"].includes(c),
              ),
            ),
          ),
      ).toEqual(["sale", "auction"]);
      const friend = (await own.locator(".bottom-row .friend").boundingBox())!;
      const quest = (await own.locator(".bottom-row .quest").boundingBox())!;
      expect(quest.x + quest.width).toBeLessThan(friend.x);
      expect(Math.abs(quest.y - friend.y)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(friend.x + friend.width - bounds.x - bounds.width),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(friend.y + friend.height - bounds.y - bounds.height),
      ).toBeLessThanOrEqual(1);
      const right = (await icons.at(-1)!.boundingBox())!;
      expect(
        Math.abs(bounds.x + bounds.width - (right.x + right.width)),
      ).toBeLessThanOrEqual(1);
      expect(
        await label.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe("rgb(0, 0, 0)");
      expect(await label.evaluate((el) => getComputedStyle(el).color)).toBe(
        "rgb(255, 255, 255)",
      );
      expect(
        await label.evaluate((el) => getComputedStyle(el).borderColor),
      ).toBe("rgb(255, 255, 255)");
    };
    for (const width of [200, 160, 144]) {
      await own.evaluate((el, width) => (el.style.width = `${width}px`), width);
      await checkAlignment();
    }
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: "test-results/screenshots/for-sale-overlay.png",
    });
    // Overlay elements must not intercept the card's normal hover behavior.
    const labelBox = (await label.boundingBox())!;
    await page.mouse.move(
      labelBox.x + labelBox.width / 2,
      labelBox.y + labelBox.height / 2,
    );
    await expect(page.locator("#kosmore-root h2")).toHaveText(
      "Northern Lights",
    );
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const toggle = options.getByLabel("Show For Sale label on cards", {
      exact: true,
    });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await options
      .getByRole("button", { name: "Save overlay settings", exact: true })
      .click();
    await expect(label).toHaveCount(0);
    await expect(
      own.locator("[data-kosmore-card-overlays] .auction"),
    ).toBeVisible();
    await toggle.check();
    await options
      .getByRole("button", { name: "Save overlay settings", exact: true })
      .click();
    await expect(label).toBeVisible();
    await options.getByLabel("Enable card overlays", { exact: true }).uncheck();
    await expect(page.locator("[data-kosmore-card-overlays]")).toHaveCount(0);
    await expect(toggle).toBeDisabled();
    expect(writeRequests).toBe(0);
  } finally {
    await options.close();
    await page.unroute("**/api/collection/*");
  }
});
test("market overlays show sale and listing prices at top right and quest before friends at bottom right with independent price switches", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...saved,
        showSaleHistoryOverlay: true,
        showActiveAuctionsOverlay: true,
        showFriendInterestOverlay: true,
        showQuestOverlay: true,
      },
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "",
        families: ["Astronomy"],
      },
    });
  });
  await page.route("**/api/cards/*/prices?**", async (route) => {
    const finish = new URL(route.request().url()).searchParams.get("finish");
    const data = prices(1);
    data.prices.sales[0].price = finish === "veil" ? "99000000" : "12000000";
    data.prices.sales[0].soldAt = new Date(
      Date.now() - (finish === "veil" ? 3600000 : 86400000),
    ).toISOString();
    await route.fulfill({ json: data });
  });
  await page.route("**/api/auctions?**", async (route) => {
    await route.fulfill({
      json: {
        items: [
          auction(1, "42", { startPrice: "1000000", bestBid: "25000000" }),
          auction(2, "42", { startPrice: "8000000" }),
          auction(3, "43", { startPrice: "1" }),
          auction(4, "42", { startPrice: "1", state: "sold" }),
        ],
        nextOffset: null,
      },
    });
  });
  const options = await context.newPage();
  try {
    await page.goto("https://kosmora.io/collection");
    const card = page.locator(".kc-article"),
      overlay = card.locator("[data-kosmore-card-overlays]"),
      sale = overlay.locator(".top-row .sale"),
      gavel = overlay.locator(".top-row .auction");
    await expect(sale.locator(".badge-price")).toHaveText("$99");
    await expect(gavel.locator(".badge-price")).toHaveText("$8");
    await expect(overlay.locator(".bottom-row .quest")).toHaveCount(1);
    await expect(
      overlay.locator(
        ".bottom-row .sale,.bottom-row .auction,.top-row .friend,.top-row .quest",
      ),
    ).toHaveCount(0);
    const alignment = async () => {
      const bounds = (await overlay.boundingBox())!,
        history = (await sale.boundingBox())!,
        auction = (await gavel.boundingBox())!;
      const quest = (await overlay
        .locator(".bottom-row .quest")
        .boundingBox())!;
      expect(Math.abs(history.y - bounds.y)).toBeLessThanOrEqual(1);
      expect(auction.x).toBeGreaterThan(history.x + history.width);
      expect(Math.abs(history.y - auction.y)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(auction.x + auction.width - bounds.x - bounds.width),
      ).toBeLessThanOrEqual(1);
      const friend = (await overlay
        .locator(".bottom-row .friend")
        .boundingBox())!;
      expect(quest.x + quest.width).toBeLessThan(friend.x);
      expect(Math.abs(quest.y - friend.y)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(friend.x + friend.width - bounds.x - bounds.width),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(friend.y + friend.height - bounds.y - bounds.height),
      ).toBeLessThanOrEqual(1);
      for (const icon of await overlay.locator(".top-row .signal-badge").all())
        expect(
          Math.abs((await icon.boundingBox())!.y - bounds.y),
        ).toBeLessThanOrEqual(1);
      expect(
        await gavel.evaluate((el) => getComputedStyle(el).borderColor),
      ).toBe("rgb(255, 113, 133)");
    };
    await mkdir("test-results/screenshots", { recursive: true });
    for (const width of [270, 144]) {
      await page
        .locator('a[href="/card/42"]')
        .evaluate((el, width) => (el.style.width = `${width}px`), width);
      await alignment();
      await card.screenshot({
        path: `test-results/screenshots/overlay-prices-${width}.png`,
      });
    }
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const lastPrice = options.getByRole("switch", {
        name: "Show last sale price",
        exact: true,
      }),
      listingPrice = options.getByRole("switch", {
        name: "Show lowest listed price",
        exact: true,
      }),
      save = options.getByRole("button", {
        name: "Save overlay settings",
        exact: true,
      });
    await options
      .getByRole("link", { name: "Card overlays", exact: true })
      .click();
    await options.screenshot({
      path: "test-results/screenshots/overlay-price-settings.png",
    });
    await options.setViewportSize({ width: 390, height: 900 });
    await options
      .getByRole("link", { name: "Card overlays", exact: true })
      .click();
    await options.screenshot({
      path: "test-results/screenshots/overlay-price-settings-390.png",
    });
    expect(
      await options.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await options.setViewportSize({ width: 1440, height: 1000 });
    await expect(lastPrice).toBeChecked();
    await expect(listingPrice).toBeChecked();
    await expect(
      options
        .locator("#card-overlays")
        .getByText(
          "Last sale price across all finishes in Kosmora’s 30-day history.",
          { exact: true },
        ),
    ).toBeVisible();
    await lastPrice.uncheck();
    await save.click();
    await expect(sale.locator(".badge-price")).toHaveCount(0);
    await expect(gavel.locator(".badge-price")).toHaveText("$8");
    await listingPrice.uncheck();
    await save.click();
    await expect(gavel.locator(".badge-price")).toHaveCount(0);
    await expect(sale).toBeVisible();
    await expect(gavel).toBeVisible();
    await alignment();
    await options
      .getByLabel("Show sale history icon on cards", { exact: true })
      .uncheck();
    await expect(lastPrice).toBeDisabled();
    await options
      .getByLabel("Show active auctions icon on cards", { exact: true })
      .uncheck();
    await expect(listingPrice).toBeDisabled();
    await options
      .getByRole("button", {
        name: "Cancel overlay settings changes",
        exact: true,
      })
      .click();
    await expect(lastPrice).toBeEnabled();
    await expect(listingPrice).toBeEnabled();
    await expect(lastPrice).not.toBeChecked();
    await expect(listingPrice).not.toBeChecked();
    await options.reload();
    await expect(lastPrice).not.toBeChecked();
    await expect(listingPrice).not.toBeChecked();
    expect(writeRequests).toBe(0);
  } finally {
    await options.close();
    await page.unroute("**/api/cards/*/prices?**");
    await page.unroute("**/api/auctions?**");
  }
});
test("saved settings independently remove the four card overlays in existing tabs", async () => {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        showSaleHistoryOverlay: true,
        showActiveAuctionsOverlay: true,
        showFriendInterestOverlay: true,
        showQuestOverlay: true,
      },
    });
  });
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "",
        families: ["Astronomy"],
      },
    });
  });
  await page.goto("https://kosmora.io/collection");
  await expect(
    page.locator("[data-kosmore-card-overlays] .sale"),
  ).toBeVisible();
  await expect(
    page.locator("[data-kosmore-card-overlays] .auction"),
  ).toBeVisible();
  await expect(
    page.locator("[data-kosmore-card-overlays] .friend"),
  ).toBeVisible();
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options
    .getByLabel("Show sale history icon on cards", { exact: true })
    .uncheck();
  await options
    .getByRole("button", { name: "Save overlay settings", exact: true })
    .click();
  await expect(page.locator("[data-kosmore-card-overlays] .sale")).toHaveCount(
    0,
  );
  await expect(
    page.locator("[data-kosmore-card-overlays] .auction"),
  ).toBeVisible();
  await options
    .getByLabel("Show active auctions icon on cards", { exact: true })
    .uncheck();
  await options
    .getByRole("button", { name: "Save overlay settings", exact: true })
    .click();
  await expect(
    page.locator("[data-kosmore-card-overlays] .auction"),
  ).toHaveCount(0);
  await expect(
    page.locator("[data-kosmore-card-overlays] .friend"),
  ).toBeVisible();
  await options
    .getByLabel("Show interested friends icon on cards", { exact: true })
    .uncheck();
  await options
    .getByRole("button", { name: "Save overlay settings", exact: true })
    .click();
  await expect(
    page.locator("[data-kosmore-card-overlays] .quest"),
  ).toBeVisible();
  await options
    .getByLabel("Show quest icon on cards", { exact: true })
    .uncheck();
  await options
    .getByRole("button", { name: "Save overlay settings", exact: true })
    .click();
  await expect(page.locator("[data-kosmore-card-overlays]")).toHaveCount(0);
  await options.close();
  expect(writeRequests).toBe(0);
});
test("popup dimensions and dismiss delay save, cancel and apply in an open tab", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  const options = await context.newPage();
  try {
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const width = options.getByLabel("Tooltip width", { exact: true });
    const height = options.getByLabel("Tooltip height", { exact: true });
    const dismiss = options.getByLabel("Dismiss delay", { exact: true });
    await expect(width).toHaveValue("440");
    await width.fill("100");
    await options
      .getByRole("button", { name: "Save tooltip settings", exact: true })
      .click();
    await expect(
      options
        .getByRole("region", { name: "tooltip settings", exact: true })
        .getByRole("status"),
    ).toContainText("Choose a tooltip width");
    await width.fill("560");
    await height.fill("760");
    await dismiss.fill("1200");
    await options
      .getByRole("button", { name: "Save tooltip settings", exact: true })
      .click();
    await expect(
      options
        .getByRole("region", { name: "tooltip settings", exact: true })
        .getByRole("status"),
    ).toContainText("Saved.");
    await expect
      .poll(async () => {
        const bounds = await popup.boundingBox();
        return { width: bounds?.width, height: bounds?.height };
      })
      .toEqual({ width: 560, height: 760 });
    await width.fill("600");
    await dismiss.fill("0");
    await options
      .getByRole("button", {
        name: "Cancel tooltip settings changes",
        exact: true,
      })
      .click();
    await expect(width).toHaveValue("560");
    await expect(dismiss).toHaveValue("1200");
    await options.reload();
    await expect(height).toHaveValue("760");
    await expect(dismiss).toHaveValue("1200");
    await options.screenshot({
      path: "test-results/screenshots/popup-settings.png",
      fullPage: true,
    });
  } finally {
    await options.close();
  }
  expect(writeRequests).toBe(0);
});
test("the configured dismiss delay starts after leaving and cancels on reentry", async () => {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": { ...settings, dismissDelayMs: 1000 },
    });
  });
  await page.goto("https://kosmora.io/collection");
  const card = page.locator(".kc-article"),
    popup = page.locator("#kosmore-root");
  await card.hover();
  await expect(popup.locator(".sales li")).toHaveCount(5);
  await page.mouse.move(10, 10);
  await page.waitForTimeout(350);
  await expect(popup).toBeVisible();
  await card.hover();
  await page.waitForTimeout(750);
  await expect(popup).toBeVisible();
  await page.mouse.move(10, 10);
  await expect(popup).toHaveCount(0);
  expect(writeRequests).toBe(0);
});
test("a pinned popup drags, stays visible, and updates cards without moving or accepting stale results", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  holdSlow = true;
  await page.goto(`https://kosmora.io/packs/open?id=${OPENING}&recap=1`);
  await page.locator(".ko-grid-open").first().hover();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await expect(
    popup.getByRole("button", { name: "Unpin popup", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const before = (await popup.boundingBox())!;
  const header = (await popup.locator(".top").boundingBox())!;
  await page.mouse.move(header.x + 35, header.y + 20);
  await page.mouse.down();
  await page.mouse.move(1020, 45, { steps: 8 });
  await page.mouse.up();
  const moved = (await popup.boundingBox())!;
  expect(moved.x).toBeGreaterThan(before.x + 100);
  await popup.getByRole("tab", { name: "Trade", exact: true }).click();
  await page.mouse.move(10, 10);
  await expect(popup).toBeVisible();
  await page.locator(".ko-grid-open").nth(3).hover();
  await expect(popup.locator("h2")).toHaveText("Andromeda");
  await expect(popup.locator(".subtitle")).toContainText("No. 46");
  await expect(
    popup.getByRole("tab", { name: "Trade", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    popup.getByRole("button", { name: "Unpin popup", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(700);
  await expect(popup.locator(".subtitle")).toContainText("No. 46");
  const updated = (await popup.boundingBox())!;
  expect(updated).toEqual(moved);
  await popup.getByRole("tab", { name: "Market", exact: true }).click();
  await popup.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(popup.locator(".sales li")).toHaveCount(5);
  expect(await popup.boundingBox()).toEqual(moved);
  await page.screenshot({ path: "test-results/screenshots/pinned-popup.png" });
  await page.evaluate(() => {
    document.querySelectorAll(".ko-grid > li")[3].remove();
  });
  await expect(popup).toBeVisible();
  await page.setViewportSize({ width: 650, height: 700 });
  await expect
    .poll(async () => {
      const clamped = (await popup.boundingBox())!;
      return clamped.x + clamped.width;
    })
    .toBeLessThanOrEqual(650);
  await expect
    .poll(async () => {
      const clamped = (await popup.boundingBox())!;
      return clamped.y + clamped.height;
    })
    .toBeLessThanOrEqual(700);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(writeRequests).toBe(0);
});
test("unpin restores automatic dismissal and Close also dismisses a pinned popup", async () => {
  await page.goto("https://kosmora.io/collection");
  const popup = page.locator("#kosmore-root");
  await page.locator(".kc-article").hover();
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await popup.getByRole("button", { name: "Unpin popup", exact: true }).click();
  await page.locator("h1").click();
  await expect(popup).toHaveCount(0);
  await page.locator(".kc-article").hover();
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await popup
    .getByRole("button", { name: "Close KosMore popup", exact: true })
    .click();
  await expect(popup).toHaveCount(0);
  expect(writeRequests).toBe(0);
});
test("the smallest popup keeps its tabs and footer accessible by scrolling", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": { ...settings, popupWidth: 320, popupHeight: 480 },
    });
  });
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await expect(popup.locator(".sales li")).toHaveCount(5);
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  const bounds = (await popup.boundingBox())!;
  expect({ width: bounds.width, height: bounds.height }).toEqual({
    width: 320,
    height: 480,
  });
  await popup.getByRole("tab", { name: "Notes", exact: true }).click();
  await popup
    .getByRole("textbox", { name: "Card notes", exact: true })
    .fill("Notes at the smallest size");
  await popup.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(popup.getByRole("status")).toHaveText("Saved locally");
  await popup
    .getByRole("button", { name: "Settings", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    popup.getByRole("button", { name: "Settings", exact: true }),
  ).toBeInViewport();
  expect(
    await popup.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/screenshots/small-popup.png" });
  expect(writeRequests).toBe(0);
});
test("all navigation hotkeys open their destination, including both market views and the alerts dialog", async () => {
  await worker.evaluate(
    async (ids) => {
      const settings = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as Record<string, unknown>;
      const hotkeys = Object.fromEntries(
        ids.map((id, i) => [
          id,
          {
            code: `Key${String.fromCharCode(65 + i)}`,
            ctrl: false,
            alt: true,
            shift: true,
            meta: false,
          },
        ]),
      );
      await chrome.storage.local.set({
        "kosmore.settings": { ...settings, enabled: false, hotkeys },
      });
    },
    NAVIGATION.map((item) => item.id),
  );
  for (const [index, item] of NAVIGATION.entries()) {
    await page.goto("https://kosmora.io/collection");
    await expect(async () => {
      await page.keyboard.press(
        `Alt+Shift+Key${String.fromCharCode(65 + index)}`,
      );
      if (item.id === "marketAlerts")
        await expect(
          page.getByRole("dialog", { name: "Market Alerts" }),
        ).toBeVisible({ timeout: 1000 });
      else
        await expect(page).toHaveURL(
          `https://kosmora.io${item.path ?? "/u/FixturePlayer"}`,
          { timeout: 1000 },
        );
    }).toPass({ timeout: 6000 });
  }
  expect(writeRequests).toBe(0);
});
test("Market Alerts works on the current market page and with the older search-bell layout", async () => {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        hotkeys: {
          marketAlerts: {
            code: "KeyA",
            ctrl: false,
            alt: true,
            shift: true,
            meta: false,
          },
        },
      },
    });
  });
  for (const legacy of [false, true]) {
    legacyMarket = legacy;
    await page.goto("https://kosmora.io/market");
    await expect(async () => {
      await page.keyboard.press("Alt+Shift+KeyA");
      await expect(
        page.getByRole("dialog", { name: "Market Alerts" }),
      ).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 6000 });
    await expect(page).toHaveURL("https://kosmora.io/market");
  }
  expect(writeRequests).toBe(0);
});
test("hotkeys ignore typing, shadow editors, composition, repeats, and extra modifiers", async () => {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        hotkeys: {
          home: {
            code: "KeyH",
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
          },
        },
      },
    });
  });
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await popup.getByRole("tab", { name: "Notes", exact: true }).click();
  const notes = popup.getByRole("textbox", { name: "Card notes", exact: true });
  await notes.fill("");
  await notes.press("h");
  await expect(notes).toHaveValue("h");
  await page.evaluate(() => {
    const fields = document.createElement("div");
    fields.id = "hotkey-inputs";
    fields.innerHTML =
      '<input aria-label="Search cards"><select aria-label="Filter"><option>One</option></select><div contenteditable="true" role="textbox" aria-label="Rich notes"></div>';
    document.body.prepend(fields);
  });
  await page
    .getByRole("textbox", { name: "Search cards", exact: true })
    .press("h");
  await page
    .getByRole("textbox", { name: "Rich notes", exact: true })
    .press("h");
  await page.getByRole("combobox", { name: "Filter", exact: true }).press("h");
  await page.locator("h1").click();
  await page.evaluate(() => {
    for (const options of [
      { repeat: true },
      { isComposing: true },
      { ctrlKey: true },
    ])
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "h",
          code: "KeyH",
          bubbles: true,
          composed: true,
          ...options,
        }),
      );
  });
  await page.keyboard.press("Shift+H");
  await expect(page).toHaveURL("https://kosmora.io/collection");
  await page.keyboard.press("h");
  await expect(page).toHaveURL("https://kosmora.io/home");
  expect(writeRequests).toBe(0);
});
test("shortcut recording detects conflicts and group saves preserve other drafts", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  await page.goto("https://kosmora.io/collection");
  const options = await context.newPage();
  try {
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const hotkeys = options.getByRole("region", {
      name: "hotkeys",
      exact: true,
    });
    const record = (label: string) =>
      hotkeys.getByRole("button", {
        name: `Set shortcut for ${label}`,
        exact: true,
      });
    await expect(hotkeys.locator(".hotkey-row")).toHaveCount(15);
    await options.getByLabel("Tooltip width", { exact: true }).fill("600");
    await record("Home").click();
    await record("Home").press("Alt+Shift+H");
    await record("Collection").click();
    await record("Collection").press("Alt+Shift+H");
    await hotkeys
      .getByRole("button", { name: "Save hotkeys", exact: true })
      .click();
    await expect(hotkeys.getByRole("status")).toContainText(
      "Home and Collection both use",
    );
    await hotkeys
      .getByRole("button", {
        name: "Clear shortcut for Collection",
        exact: true,
      })
      .click();
    await record("Atlas").click();
    await record("Atlas").press("Escape");
    await expect(record("Atlas")).toHaveText("Not set");
    await hotkeys
      .getByRole("button", { name: "Save hotkeys", exact: true })
      .click();
    await expect(hotkeys.getByRole("status")).toContainText("Saved.");
    const stored = await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ] as { popupWidth: number; hotkeys: object },
    );
    expect(stored.popupWidth).toBe(440);
    expect(Object.keys(stored.hotkeys)).toEqual(["home"]);
    await record("Atlas").click();
    await record("Atlas").press("Alt+Shift+X");
    await options
      .getByRole("button", {
        name: "Cancel tooltip settings changes",
        exact: true,
      })
      .click();
    await expect(
      options.getByLabel("Tooltip width", { exact: true }),
    ).toHaveValue("440");
    await expect(record("Atlas")).toHaveText("Alt + Shift + X");
    await options
      .getByLabel("Show sale history icon on cards", { exact: true })
      .check();
    await options
      .getByRole("button", { name: "Save overlay settings", exact: true })
      .click();
    await expect(
      options
        .getByRole("region", { name: "overlay settings", exact: true })
        .getByRole("status"),
    ).toContainText("Saved.");
    await hotkeys
      .getByRole("button", { name: "Cancel hotkeys changes", exact: true })
      .click();
    await expect(record("Atlas")).toHaveText("Not set");
    await options.getByLabel("Show Min Price", { exact: true }).uncheck();
    await options
      .getByRole("button", { name: "Save stat layout", exact: true })
      .click();
    await expect(
      options
        .getByRole("region", { name: "stat layout", exact: true })
        .getByRole("status"),
    ).toContainText("Saved.");
    await hotkeys.screenshot({
      path: "test-results/screenshots/navigation-hotkeys.png",
    });
    await options
      .getByRole("region", { name: "tooltip settings", exact: true })
      .screenshot({ path: "test-results/screenshots/popup-group-save.png" });
    await page.locator("h1").click();
    await page.keyboard.press("Alt+Shift+H");
    await expect(page).toHaveURL("https://kosmora.io/home");
    await hotkeys
      .getByRole("button", { name: "Clear shortcut for Home", exact: true })
      .click();
    await hotkeys
      .getByRole("button", { name: "Save hotkeys", exact: true })
      .click();
    await expect(hotkeys.getByRole("status")).toContainText("Saved.");
    await options.reload();
    await expect(record("Home")).toHaveText("Not set");
    await expect(
      options.getByLabel("Show sale history icon on cards", { exact: true }),
    ).toBeChecked();
    await expect(
      options.getByLabel("Show Min Price", { exact: true }),
    ).not.toBeChecked();
  } finally {
    await options.close();
  }
  expect(writeRequests).toBe(0);
});
test("pinned albums use three columns at default and minimum popup widths", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  const extras = [
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004",
  ];
  await page.route("**/api/albums**", async (route) => {
    await route.fulfill({
      json: {
        albums: [
          ...albums().albums,
          ...extras.map((id, i) => ({
            id,
            name:
              i === 0
                ? "An extra album with a very long name that must stay on one line"
                : `Extra album ${i + 1}`,
            items: 2,
            contains: false,
            containsCount: 0,
          })),
        ],
      },
    });
  });
  try {
    await worker.evaluate(
      async (ids) => {
        const settings = (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ] as Record<string, unknown>;
        await chrome.storage.local.set({
          "kosmore.settings": {
            ...settings,
            pinnedAlbums: { fixtureplayer: ids },
          },
        });
      },
      [ALBUM_A, ALBUM_B, ...extras],
    );
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root");
    await expect(popup.locator(".albums button")).toHaveCount(4);
    await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
    for (const width of [440, 320]) {
      await worker.evaluate(async (popupWidth) => {
        const settings = (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ] as Record<string, unknown>;
        await chrome.storage.local.set({
          "kosmore.settings": { ...settings, popupWidth },
        });
      }, width);
      await expect
        .poll(async () => (await popup.boundingBox())?.width)
        .toBe(width);
      const buttons = await popup
        .locator(".albums button")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y };
          }),
        );
      expect(buttons[0].y).toBe(buttons[1].y);
      expect(buttons[1].y).toBe(buttons[2].y);
      expect(buttons[3].y).toBeGreaterThan(buttons[0].y);
      expect(buttons[3].x).toBe(buttons[0].x);
      const longName = popup.locator(".album-name").nth(2);
      await expect(longName).toHaveCSS("white-space", "nowrap");
      await expect(longName).toHaveCSS("text-overflow", "ellipsis");
      expect(
        await longName.evaluate((el) => el.scrollWidth > el.clientWidth),
      ).toBe(true);
      await popup.screenshot({
        path: `test-results/screenshots/three-albums-${width}.png`,
      });
    }
  } finally {
    await page.unroute("**/api/albums**");
  }
  expect(writeRequests).toBe(0);
});
test("My Profile uses the current account and a delayed lookup cannot override later navigation", async () => {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        hotkeys: {
          profile: {
            code: "KeyP",
            ctrl: false,
            alt: true,
            shift: true,
            meta: false,
          },
        },
      },
    });
  });
  account = "OtherPlayer";
  await page.goto("https://kosmora.io/collection");
  await expect(async () => {
    await page.keyboard.press("Alt+Shift+P");
    await expect(page).toHaveURL("https://kosmora.io/u/OtherPlayer", {
      timeout: 1000,
    });
  }).toPass({ timeout: 6000 });
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pause = async (route: Route) => {
    started();
    await held;
    await route.fallback();
  };
  await page.goto("https://kosmora.io/collection");
  await page.route("**/api/me", pause);
  try {
    await page.keyboard.press("Alt+Shift+P");
    await ready;
    await page.evaluate(() => history.pushState({}, "", "/atlas"));
    release();
    await page.waitForTimeout(200);
    await expect(page).toHaveURL("https://kosmora.io/atlas");
  } finally {
    release();
    await page.unroute("**/api/me", pause);
  }
  expect(writeRequests).toBe(0);
});
test("pinning remembers position across page loads, clears the card, and unpinning restores card placement", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": { ...settings, popupHeight: 640 },
    });
  });
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await expect(popup.locator(".last-sold")).toContainText("Last Sale: $");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  const header = (await popup.locator(".top").boundingBox())!;
  await page.mouse.move(header.x + 25, header.y + 20);
  await page.mouse.down();
  await page.mouse.move(925, 120, { steps: 5 });
  await page.mouse.up();
  const pinned = (await popup.boundingBox())!;
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const states = Object.values(
          await chrome.storage.session.get(null),
        ) as { pinned: boolean }[];
        return states.some((state) => state.pinned);
      }),
    )
    .toBe(true);
  await page.mouse.move(10, 10);
  await page.goto("https://kosmora.io/home");
  await expect(
    popup.getByText("No Card Selected", { exact: true }),
  ).toBeVisible();
  expect(await popup.boundingBox()).toEqual(pinned);
  await expect(popup.locator(".body")).toBeHidden();
  await expect(popup.locator(".last-sold")).toBeHidden();
  await expect(
    popup.getByRole("button", { name: "Refresh", exact: true }),
  ).toHaveCount(0);
  const centered = await popup.locator(".empty-state").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect(),
      area = element.getBoundingClientRect();
    return {
      x: (text.left + text.right - area.left - area.right) / 2,
      y: (text.top + text.bottom - area.top - area.bottom) / 2,
    };
  });
  expect(Math.abs(centered.x)).toBeLessThan(1);
  expect(Math.abs(centered.y)).toBeLessThan(1);
  await page.screenshot({ path: "test-results/screenshots/pinned-empty.png" });
  const other = await context.newPage();
  try {
    await other.goto("https://kosmora.io/collection");
    await expect(other.locator("#kosmore-root")).toHaveCount(0);
  } finally {
    await other.close();
  }
  await page.locator(".kc-article").hover();
  await expect(popup.locator("h2")).toHaveText("Northern Lights");
  expect(await popup.boundingBox()).toEqual(pinned);
  await popup.getByRole("button", { name: "Unpin popup", exact: true }).click();
  expect((await popup.boundingBox())!.x).not.toBe(pinned.x);
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  expect(await popup.boundingBox()).toEqual(pinned);
  await page.mouse.move(10, 10);
  await page.reload();
  await expect(
    popup.getByText("No Card Selected", { exact: true }),
  ).toBeVisible();
  expect(await popup.boundingBox()).toEqual(pinned);
  await popup.getByRole("button", { name: "Unpin popup", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await page.goto("https://kosmora.io/collection");
  await expect(popup).toHaveCount(0);
  expect(writeRequests).toBe(0);
});
test("same-document navigation clears pinned details and discards delayed card responses", async () => {
  holdSlow = true;
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await page.mouse.move(10, 10);
  await page.evaluate(() => {
    history.pushState({}, "", "/atlas");
    document.querySelector("main")!.innerHTML = "<h1>Atlas</h1>";
  });
  await expect(
    popup.getByText("No Card Selected", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(800);
  await expect(
    popup.getByText("No Card Selected", { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (html) => {
      document
        .querySelector("main")!
        .insertAdjacentHTML(
          "beforeend",
          `<a href="/card/46" style="display:block;width:270px;margin:30px">${html}</a>`,
        );
    },
    face("46", "Andromeda"),
  );
  await page.locator(".kc-article").hover();
  await expect(popup.locator("h2")).toHaveText("Andromeda");
  await expect(popup.locator(".subtitle")).toContainText("No. 46");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(popup).toHaveCount(0);
  expect(writeRequests).toBe(0);
});
test("all popup edges resize and autosave dimensions while preserving dirty settings fields", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": { ...settings, popupWidth: 460, popupHeight: 640 },
    });
  });
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  const options = await context.newPage();
  try {
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(
      options.getByLabel("Tooltip width", { exact: true }),
    ).toHaveValue("460");
    for (const edge of ["e", "s", "w", "n", "se", "nw", "ne", "sw"]) {
      const before = (await popup.boundingBox())!,
        handle = (await popup.locator(`[data-edge="${edge}"]`).boundingBox())!;
      const x = handle.x + handle.width / 2,
        y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(
        x + (edge.includes("e") ? -10 : edge.includes("w") ? 10 : 0),
        y + (edge.includes("s") ? -10 : edge.includes("n") ? 10 : 0),
        { steps: 3 },
      );
      await page.mouse.up();
      const after = (await popup.boundingBox())!;
      expect(after.width).toBe(
        before.width - (edge.includes("e") || edge.includes("w") ? 10 : 0),
      );
      expect(after.height).toBe(
        before.height - (edge.includes("s") || edge.includes("n") ? 10 : 0),
      );
      await expect(
        options.getByLabel("Tooltip width", { exact: true }),
      ).toHaveValue(String(after.width));
      await expect(
        options.getByLabel("Tooltip height", { exact: true }),
      ).toHaveValue(String(after.height));
    }
    await options.getByLabel("Tooltip width", { exact: true }).fill("555");
    const edge = popup.locator('[data-edge="e"]');
    await edge.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      options.getByLabel("Tooltip width", { exact: true }),
    ).toHaveValue("555");
    const size = (await popup.boundingBox())!;
    await options
      .getByRole("button", {
        name: "Cancel tooltip settings changes",
        exact: true,
      })
      .click();
    await expect(
      options.getByLabel("Tooltip width", { exact: true }),
    ).toHaveValue(String(size.width));
    await page.mouse.move(10, 10);
    await popup.screenshot({
      path: "test-results/screenshots/popup-resized.png",
    });
    await page.goto("https://kosmora.io/home");
    await expect(
      popup.getByText("No Card Selected", { exact: true }),
    ).toBeVisible();
    expect(await popup.boundingBox()).toEqual(size);
    await page.setViewportSize({ width: 400, height: 400 });
    await expect
      .poll(async () => (await popup.boundingBox())!.width)
      .toBeLessThanOrEqual(376);
    expect((await popup.boundingBox())!.height).toBeLessThanOrEqual(376);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect
      .poll(async () => (await popup.boundingBox())!.width)
      .toBe(size.width);
    await expect.poll(() => popup.boundingBox()).toEqual(size);
    await options.reload();
    await expect(
      options.getByLabel("Tooltip width", { exact: true }),
    ).toHaveValue(String(size.width));
    await expect(
      options.getByLabel("Tooltip height", { exact: true }),
    ).toHaveValue(String(size.height));
    await page.keyboard.press("Escape");
  } finally {
    await options.close();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  expect(writeRequests).toBe(0);
});
test("family badge links open your collection's family page by mouse and keyboard", async () => {
  const families = [
    { id: "film-television.actors", name: "Film and Television Actors" },
    { id: "space.astronomy", name: "Astronomy" },
  ];
  await page.route("**/api/collection/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    await route.fulfill({ json: { ...card(id), families } });
  });
  await page.route("**/families/*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body><h1>Family collection</h1></body></html>",
    }),
  );
  try {
    for (const keyboard of [false, true]) {
      await page.goto(`https://kosmora.io/packs/open?recap=1&batch=${OPENING}`);
      await page.locator(".ko-grid > li").first().hover();
      const popup = page.locator("#kosmore-root");
      const list = popup.getByRole("list", {
        name: "Card families",
        exact: true,
      });
      const link = list.getByRole("link", {
        name: "Film and Television Actors",
        exact: true,
      });
      await expect(link).toHaveAttribute(
        "href",
        "/families/film-television.actors",
      );
      await expect(
        list.getByRole("link", { name: "Astronomy", exact: true }),
      ).toHaveAttribute("href", "/families/space.astronomy");
      if (keyboard) {
        await link.focus();
        await link.press("Enter");
      } else await link.click();
      await expect(page).toHaveURL(
        "https://kosmora.io/families/film-television.actors",
      );
      await expect(
        page.getByRole("heading", { name: "Family collection" }),
      ).toBeVisible();
      expect(writeRequests).toBe(0);
    }
  } finally {
    await page.unroute("**/api/collection/*");
    await page.unroute("**/families/*");
  }
});

test("tooltip header shows family badges and matching inline market prices independently of overlay and stat settings", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...saved,
        statBoxesEnabled: false,
        cardOverlaysEnabled: false,
      },
    });
  });
  const families = [
    { id: "space.astronomy", name: "Astronomy" },
    { id: "space.exploration", name: "Space Exploration" },
    {
      id: "nature.sky",
      name: "Earth’s Atmosphere and Natural Light Phenomena",
    },
  ];
  await page.route("**/api/collection/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    await route.fulfill({
      json: { ...card(id), families: id === "42" ? families : [] },
    });
  });
  let price = "8000000",
    reads = 0,
    mode = "listed";
  await page.route("**/api/auctions?**", async (route) => {
    reads++;
    if (mode === "failed") {
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
      return;
    }
    await route.fulfill({
      json: {
        items:
          mode === "none"
            ? []
            : [
                auction(1, "42", { startPrice: price }),
                auction(2, "43", { startPrice: "1" }),
              ],
        nextOffset: null,
      },
    });
  });
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root"),
      header = popup.locator(".top"),
      last = header.locator(".last-sold"),
      listed = header.locator(".listed-for");
    await expect(
      header
        .getByRole("list", { name: "Card families", exact: true })
        .getByRole("listitem"),
    ).toHaveText(families.map((f) => f.name));
    await expect(last).toHaveText("Last Sale: $12.00");
    await expect(listed).toHaveText("Listed For: $8");
    expect(reads).toBe(1);
    await expect(popup.locator(".metric")).toHaveCount(0);
    await expect(last.locator("svg")).toHaveCount(1);
    await expect(listed.locator("svg")).toHaveCount(1);
    expect(await last.evaluate((el) => getComputedStyle(el).borderColor)).toBe(
      "rgb(182, 149, 90)",
    );
    expect(
      await listed.evaluate((el) => getComputedStyle(el).borderColor),
    ).toBe("rgb(255, 113, 133)");
    await mkdir("test-results/screenshots", { recursive: true });
    for (const width of [440, 320]) {
      await worker.evaluate(async (popupWidth) => {
        const saved = (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ] as object;
        await chrome.storage.local.set({
          "kosmore.settings": { ...saved, popupWidth },
        });
      }, width);
      await expect
        .poll(async () => (await popup.boundingBox())!.width)
        .toBe(width);
      const name = (await header.locator("h2").boundingBox())!,
        subtitle = (await header.locator(".subtitle").boundingBox())!,
        family = (await header.locator(".family-badge").first().boundingBox())!,
        lastBox = (await last.boundingBox())!,
        listedBox = (await listed.boundingBox())!,
        headerBox = (await header.boundingBox())!;
      expect(Math.abs(name.x - subtitle.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(subtitle.x - family.x)).toBeLessThanOrEqual(1);
      expect(family.y).toBeGreaterThanOrEqual(subtitle.y + subtitle.height);
      expect(lastBox.y).toBeGreaterThan(family.y);
      expect(Math.abs(lastBox.x - name.x)).toBeLessThanOrEqual(1);
      expect(listedBox.x).toBeGreaterThan(lastBox.x + lastBox.width);
      expect(Math.abs(lastBox.y - listedBox.y)).toBeLessThanOrEqual(1);
      expect(listedBox.x + listedBox.width).toBeLessThan(
        headerBox.x + headerBox.width,
      );
      expect(
        headerBox.y + headerBox.height - lastBox.y - lastBox.height,
      ).toBeLessThanOrEqual(15);
      await header.screenshot({
        path: `test-results/screenshots/tooltip-header-families-${width}.png`,
      });
    }
    price = "6000000";
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(listed).toHaveText("Listed For: $6");
    mode = "failed";
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(listed).toHaveText("Listed For: Unavailable");
    mode = "none";
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(listed).toBeHidden();
    await expect(last).toBeVisible();
    mode = "listed";
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(listed).toBeVisible();
    await expect(listed).toHaveText("Listed For: $6");
    await page.evaluate(
      (html) => (document.querySelector("main")!.innerHTML = html),
      face("46", "Andromeda"),
    );
    await page.locator(".kc-article").hover();
    await expect(popup.locator("h2")).toHaveText("Andromeda");
    await expect(popup.locator(".subtitle")).toContainText("No. 46");
    await expect(popup.locator(".family-badge")).toHaveCount(0);
    expect(writeRequests).toBe(0);
  } finally {
    await page.unroute("**/api/collection/*");
    await page.unroute("**/api/auctions?**");
  }
});
test("tooltip price badges hide independently for absent history and listings and return after refresh", async () => {
  let hasHistory = false,
    hasListings = false;
  await page.route("**/api/cards/*/prices?**", (route) =>
    route.fulfill({ json: prices(hasHistory ? 3 : 0) }),
  );
  await page.route("**/api/auctions?**", (route) =>
    route.fulfill({
      json: {
        items: hasListings ? [auction(1, "42", { startPrice: "8000000" })] : [],
        nextOffset: null,
      },
    }),
  );
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root"),
      last = popup.locator(".last-sold"),
      listed = popup.locator(".listed-for"),
      row = popup.locator(".header-prices"),
      refresh = popup.getByRole("button", { name: "Refresh", exact: true });
    await expect(last).toBeHidden();
    await expect(listed).toBeHidden();
    await expect(row).toBeHidden();
    await mkdir("test-results/screenshots", { recursive: true });
    await popup.screenshot({
      path: "test-results/screenshots/tooltip-no-price-badges.png",
    });
    hasListings = true;
    await refresh.click();
    await expect(listed).toBeVisible();
    await expect(listed).toHaveText("Listed For: $8");
    await expect(last).toBeHidden();
    await expect(row).toBeVisible();
    hasHistory = true;
    hasListings = false;
    await refresh.click();
    await expect(last).toBeVisible();
    await expect(last).toHaveText("Last Sale: $12.00");
    await expect(listed).toBeHidden();
    await expect(row).toBeVisible();
    hasListings = true;
    await refresh.click();
    await expect(last).toBeVisible();
    await expect(listed).toBeVisible();
    hasHistory = false;
    hasListings = false;
    await refresh.click();
    await expect(last).toBeHidden();
    await expect(listed).toBeHidden();
    await expect(row).toBeHidden();
    expect(writeRequests).toBe(0);
  } finally {
    await page.unroute("**/api/cards/*/prices?**");
    await page.unroute("**/api/auctions?**");
  }
});
test("empty market history is a centered bold message while pending and failed histories remain distinct", async () => {
  let release!: () => void,
    started!: () => void,
    fail = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/cards/*/prices?**", async (route) => {
    const finish = new URL(route.request().url()).searchParams.get("finish");
    if (finish === "fullart") {
      started();
      await held;
    }
    if (fail && finish === "veil")
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
    else await route.fulfill({ json: prices(0) });
  });
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    await ready;
    const popup = page.locator("#kosmore-root"),
      market = popup.getByRole("tabpanel", { name: "Market", exact: true });
    await expect(
      market.getByText("No Market History", { exact: true }),
    ).toHaveCount(0);
    release();
    const empty = market.locator("strong");
    await expect(empty).toHaveText("No Market History");
    await expect(popup.locator(".last-sold")).toBeHidden();
    await expect(
      market.locator(".chart,.stats,.sales,.legend,.section-head"),
    ).toHaveCount(0);
    await expect(market.locator(":scope > *")).toHaveCount(1);
    expect(
      Number(await empty.evaluate((el) => getComputedStyle(el).fontWeight)),
    ).toBeGreaterThanOrEqual(600);
    const box = (await market.boundingBox())!,
      message = (await empty.boundingBox())!;
    expect(
      Math.abs(box.x + box.width / 2 - message.x - message.width / 2),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(box.y + box.height / 2 - message.y - message.height / 2),
    ).toBeLessThanOrEqual(1);
    await mkdir("test-results/screenshots", { recursive: true });
    await popup.screenshot({
      path: "test-results/screenshots/tooltip-no-market-history.png",
    });
    await popup.getByRole("tab", { name: "Trade", exact: true }).click();
    await expect(empty).toBeHidden();
    await popup.getByRole("tab", { name: "Market", exact: true }).click();
    await expect(empty).toBeVisible();
    fail = true;
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(market).toContainText("503");
    await expect(popup.locator(".last-sold")).toBeVisible();
    await expect(popup.locator(".last-sold")).toHaveText(
      "Last Sale: Unavailable",
    );
    await expect(
      market.getByText("No Market History", { exact: true }),
    ).toHaveCount(0);
    expect(writeRequests).toBe(0);
  } finally {
    release();
    await page.unroute("**/api/cards/*/prices?**");
  }
});
test("the header shows the newest completed sale across selected variants", async () => {
  await page.route("**/api/cards/*/prices*", async (route) => {
    const finish = new URL(route.request().url()).searchParams.get("finish")!;
    const amount =
      finish === "fullart"
        ? "12345000"
        : finish === "veil"
          ? "90000000"
          : "2000000";
    const day = finish === "fullart" ? "03" : finish === "veil" ? "02" : "01";
    const fixture = prices(1);
    await route.fulfill({
      json: {
        prices: {
          ...fixture.prices,
          low: amount,
          median: amount,
          high: amount,
          sales: [
            {
              ...fixture.prices.sales[0],
              price: amount,
              soldAt: `2026-11-${day}T00:00:00Z`,
            },
          ],
        },
      },
    });
  });
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root");
    await expect(popup.locator(".top .last-sold")).toHaveText(
      "Last Sale: $12.35",
    );
    await popup.getByLabel("Full art", { exact: true }).uncheck();
    await expect(popup.locator(".last-sold")).toHaveText("Last Sale: $90.00");
    await popup.getByLabel("Shiny", { exact: true }).uncheck();
    await expect(popup.locator(".last-sold")).toHaveText("Last Sale: $2.00");
    await popup.getByLabel("Standard", { exact: true }).uncheck();
    await expect(popup.locator(".last-sold")).toBeHidden();
  } finally {
    await page.unroute("**/api/cards/*/prices*");
  }
  expect(writeRequests).toBe(0);
});
test("activity buttons replace hover and focus across boxes and journal rows without activating native controls", async () => {
  await page.goto("https://kosmora.io/market?tab=overview&view=mine");
  const controls = page.locator(".mk-act,.md-lot,.md-ledger > li");
  const before = await controls.evaluateAll((elements) =>
    elements.map((el) => ({
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
    })),
  );
  await enableTooltipButtons();
  await expect(tooltipButtonLayer()).toHaveCount(5);
  expect(
    await controls.evaluateAll((elements) =>
      elements.map((el) => ({
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
      })),
    ),
  ).toEqual(before);
  const popup = page.locator("#kosmore-root");
  for (const [index, name, id] of [
    [0, "Northern Lights", "42"],
    [1, "Andromeda", "46"],
    [2, "Orion Nebula", "47"],
    [3, "Cassini", "48"],
    [4, "Voyager 1", "49"],
  ] as const) {
    const row = controls.nth(index),
      layer = row.locator("[data-kosmore-tooltip-buttons]"),
      button = layer.getByRole("button", {
        name: `Open card tooltip for ${name}`,
        exact: true,
      });
    await row.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    await row.locator(".kc-img").hover();
    await page.waitForTimeout(140);
    await expect(popup).toHaveCount(0);
    await row.locator("a").focus();
    await page.waitForTimeout(140);
    await expect(popup).toHaveCount(0);
    expect(await layer.evaluate((host) => host.closest("a,button"))).toBeNull();
    const root = (await row.boundingBox())!,
      icon = (await layer.boundingBox())!;
    expect(Math.abs(icon.x + icon.width / 2 - root.x - 8)).toBeLessThan(1);
    expect(
      Math.abs(icon.y + icon.height / 2 - root.y - root.height + 8),
    ).toBeLessThan(1);
    await button.focus();
    await button.press("Enter");
    await expect(popup.locator("h2")).toHaveText(name);
    await expect(popup.locator(".subtitle")).toContainText(`No. ${id}`);
    await expect(page).toHaveURL(
      "https://kosmora.io/market?tab=overview&view=mine",
    );
    await popup
      .getByRole("button", { name: "Close KosMore popup", exact: true })
      .click();
  }
  await page.getByTestId("rebid").first().click();
  await expect(page.locator("body")).toHaveAttribute("data-bids", "1");
  await page.getByTestId("dash-results").scrollIntoViewIfNeeded();
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/activity-buttons-journal.png",
  });
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": { ...saved, useOverlayButtonInsteadOfHover: false },
    });
  });
  await expect(tooltipButtonLayer()).toHaveCount(0);
  await page.locator(".md-ledger-name").first().hover();
  await expect(popup.locator("h2")).toHaveText("Cassini");
  await page.keyboard.press("Escape");
  const link = page.locator(".md-ledger > li > a").first(),
    href = await link.getAttribute("href");
  await link.click();
  await expect(page).toHaveURL(`https://kosmora.io${href}`);
  expect(writeRequests).toBe(0);
});

test("activity buttons follow journal replacements, collapsed view and hidden controls on a phone width", async () => {
  await enableTooltipButtons();
  await page.setViewportSize({ width: 390, height: 900 });
  try {
    await page.goto("https://kosmora.io/market?tab=overview&view=mine");
    const journal = page.getByTestId("dash-results");
    await journal.scrollIntoViewIfNeeded();
    await expect(
      journal.getByRole("button", {
        name: "Open card tooltip for Cassini",
        exact: true,
      }),
    ).toBeVisible();
    await page.evaluate(
      (html) => {
        document.querySelector(".md-journal")!.outerHTML =
          `<ul class="md-ledger">${html}</ul>`;
      },
      journalRow("50", "Replacement journal card", "kc-fa"),
    );
    await expect(tooltipButton("Cassini")).toHaveCount(0);
    const row = journal.locator(".md-ledger > li"),
      button = journal.getByRole("button", {
        name: "Open card tooltip for Replacement journal card",
        exact: true,
      });
    await row.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    await expect(journal.locator("[data-kosmore-tooltip-buttons]")).toHaveCount(
      1,
    );
    await row.evaluate((el) => {
      (el as HTMLElement).hidden = true;
    });
    await expect(journal.locator("[data-kosmore-tooltip-buttons]")).toHaveCount(
      0,
    );
    await row.evaluate((el) => {
      (el as HTMLElement).hidden = false;
    });
    await expect(button).toBeVisible();
    await button.click();
    const popup = page.locator("#kosmore-root");
    await expect(popup.locator("h2")).toHaveText("Replacement journal card");
    await expect(popup.locator(".subtitle")).toContainText("No. 50 · Full art");
    await popup
      .getByRole("button", { name: "Close KosMore popup", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/screenshots/activity-buttons-phone.png",
    });
    expect(writeRequests).toBe(0);
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});

test("market activity thumbnails and names open card details in all three sections without bidding", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  await page.goto("https://kosmora.io/market?tab=overview&view=mine");
  const popup = page.locator("#kosmore-root");
  for (const [section, name, id, variant] of [
    ["dash-turn", "Northern Lights", "42", "Shiny"],
    ["dash-bids", "Andromeda", "46", "Full art"],
    ["dash-sale", "Orion Nebula", "47", "Standard"],
  ] as const) {
    const row = page.getByTestId(section);
    for (const target of [row.locator(".kc-img"), row.locator(".ui-line")]) {
      await target.hover();
      await expect(popup.locator("h2")).toHaveText(name);
      await expect(popup.locator(".subtitle")).toContainText(
        `No. ${id} · ${variant}`,
      );
      await expect(popup.locator(".last-sold")).toContainText("Last Sale: $");
      await page.keyboard.press("Escape");
    }
    await row.locator("a").focus();
    await expect(popup.locator("h2")).toHaveText(name);
    await page.keyboard.press("Escape");
  }
  await page.getByTestId("dash-turn").locator(".mk-act-summary").hover();
  await expect(popup.locator("h2")).toHaveText("Northern Lights");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  const before = await popup.boundingBox();
  await page.getByTestId("dash-sale").locator(".ui-line").hover();
  await expect(popup.locator("h2")).toHaveText("Orion Nebula");
  expect(await popup.boundingBox()).toEqual(before);
  await page.screenshot({
    path: "test-results/screenshots/market-activity-hover.png",
  });
  await expect(page.locator("body")).toHaveAttribute("data-bids", "0");
  expect(writeRequests).toBe(0);
});
test("compact market activity thumbnails omit overlays while ordinary cards and popup headers retain them", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        showSaleHistoryOverlay: true,
        showFriendInterestOverlay: true,
        showQuestOverlay: true,
      },
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "",
        families: ["Astronomy"],
      },
    });
  });
  await page.goto("https://kosmora.io/market?tab=overview&view=mine");
  await page.evaluate(
    (html) =>
      document.body.insertAdjacentHTML(
        "afterbegin",
        `<a id="ordinary-card" href="/card/42" style="position:fixed;right:24px;top:24px;width:140px">${html}</a>`,
      ),
    face(),
  );
  await expect(
    page.locator("#ordinary-card [data-kosmore-card-overlays] .sale"),
  ).toBeVisible();
  await expect(
    page.locator("#ordinary-card [data-kosmore-card-overlays] .friend"),
  ).toBeVisible();
  await expect(
    page.locator("#ordinary-card [data-kosmore-card-overlays] .quest"),
  ).toBeVisible();
  for (const section of ["dash-turn", "dash-bids", "dash-sale"]) {
    await expect(
      page.getByTestId(section).locator("[data-kosmore-card-overlays]"),
    ).toHaveCount(0);
  }
  await page.getByTestId("dash-turn").locator(".kc-img").hover();
  const popup = page.locator("#kosmore-root");
  await expect(popup.locator("h2")).toHaveText("Northern Lights");
  await expect(popup.locator(".header-prices .sale")).toBeVisible();
  await expect(popup.locator(".header-signals .friend")).toBeVisible();
  await page.screenshot({
    path: "test-results/screenshots/market-activity-no-overlays.png",
  });
  expect(writeRequests).toBe(0);
});
test("market activity detection follows replaced rows and leaves action controls clickable", async () => {
  await page.goto("https://kosmora.io/market?tab=overview&view=mine");
  const row = page.getByTestId("dash-turn"),
    popup = page.locator("#kosmore-root");
  await row.locator(".kc-img").hover();
  await expect(popup.locator("h2")).toHaveText("Northern Lights");
  await page.keyboard.press("Escape");
  await row.getByTestId("rebid").hover();
  await page.waitForTimeout(200);
  await expect(popup).toHaveCount(0);
  await row.getByTestId("rebid").click();
  await expect(page.locator("body")).toHaveAttribute("data-bids", "1");
  await page.evaluate(
    (html) => {
      document.querySelector('[data-testid="dash-turn"] .mk-acts')!.innerHTML =
        html;
    },
    activityRow("48", "Cassini", "kc-veil"),
  );
  await row.locator(".mk-act-name").hover();
  await expect(popup.locator("h2")).toHaveText("Cassini");
  await expect(popup.locator(".subtitle")).toContainText("No. 48 · Shiny");
  expect(writeRequests).toBe(0);
});
test("long-press multi-select supports popup hover, focus and pinning while preserving selection", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  await page.route("https://kosmora.io/collection?multi-select", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: multiSelectFixture(),
    }),
  );
  await page.goto("https://kosmora.io/collection?multi-select");
  const popup = page.locator("#kosmore-root"),
    picks = page.locator(".pick-hit");
  await page.locator("a.kc-link").first().hover();
  await page.mouse.down();
  await expect(picks).toHaveCount(2);
  await page.mouse.up();
  for (const [index, name, finish] of [
    [0, "Northern Lights", "Shiny"],
    [1, "Andromeda", "Full art"],
  ] as const) {
    await page.mouse.move(10, 10);
    await picks.nth(index).hover();
    await expect(popup.locator("h2")).toHaveText(name);
    await expect(popup.locator(".subtitle")).toContainText(finish);
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(popup.locator(".sales li")).toHaveCount(5);
    await page.keyboard.press("Escape");
    await picks.nth(index).focus();
    await expect(popup.locator("h2")).toHaveText(name);
    await page.keyboard.press("Escape");
  }
  await picks.nth(0).hover();
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  const header = (await popup.locator(".top").boundingBox())!;
  await page.mouse.move(header.x + 25, header.y + 20);
  await page.mouse.down();
  await page.mouse.move(1040, 45, { steps: 5 });
  await page.mouse.up();
  const before = await popup.boundingBox();
  await picks.nth(1).hover();
  await expect(popup.locator("h2")).toHaveText("Andromeda");
  expect(await popup.boundingBox()).toEqual(before);
  await expect(picks.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(picks.nth(1)).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({
    path: "test-results/screenshots/multi-select-popup.png",
  });
  await page.keyboard.press("Escape");
  await picks.nth(1).click();
  await expect(picks.nth(1)).toHaveAttribute("aria-pressed", "true");
  await picks.nth(0).click();
  await expect(picks.nth(0)).toHaveAttribute("aria-pressed", "false");
  expect(writeRequests).toBe(0);
});
test("Sell Many picker supports hover and focus without selecting cards or closing its dialog", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  sellMany = true;
  await page.goto("https://kosmora.io/market");
  const dialog = page.locator("dialog.mk-sell-sheet"),
    popup = page.locator("#kosmore-root");
  for (const [name, id, variant] of [
    ["Northern Lights", "42", "Shiny"],
    ["Andromeda", "46", "Full art"],
  ] as const) {
    const pick = dialog.getByRole("button", {
      name: `Pick ${name}`,
      exact: true,
    });
    await pick.hover();
    await expect(popup.locator("h2")).toHaveText(name);
    await expect(popup.locator(".subtitle")).toContainText(
      `No. ${id} · ${variant}`,
    );
    await expect(pick).toHaveAttribute("aria-pressed", "false");
    await expect(popup.locator(".last-sold")).toContainText("Last Sale: $");
    await popup.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(popup.locator(".sales li")).toHaveCount(5);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await pick.focus();
    await expect(popup.locator("h2")).toHaveText(name);
    await page.keyboard.press("Escape");
  }
  const first = dialog.getByRole("button", {
    name: "Pick Northern Lights",
    exact: true,
  });
  await first.hover();
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  const header = (await popup.locator(".top").boundingBox())!;
  await page.mouse.move(header.x + 25, header.y + 20);
  await page.mouse.down();
  await page.mouse.move(1040, 45, { steps: 5 });
  await page.mouse.up();
  const before = await popup.boundingBox();
  await dialog
    .getByRole("button", { name: "Pick Andromeda", exact: true })
    .hover();
  await expect(popup.locator("h2")).toHaveText("Andromeda");
  expect(await popup.boundingBox()).toEqual(before);
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(
    dialog.getByRole("button", { name: "Pick Andromeda", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({
    path: "test-results/screenshots/sell-many-picker.png",
  });
  await page.keyboard.press("Escape");
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-continued",
    "true",
  );
  expect(writeRequests).toBe(0);
});
test("Sell Many batch thumbnails and names update the pinned popup without changing sale inputs", async () => {
  await mkdir("test-results/screenshots", { recursive: true });
  await page.goto(
    "https://kosmora.io/market/sell/batch?s=42.v,46.f&from=market",
  );
  const rows = page.locator(".bsell-row"),
    popup = page.locator("#kosmore-root");
  await rows.nth(0).locator(".kc-img").hover();
  await expect(popup.locator("h2")).toHaveText("Northern Lights");
  await expect(popup.locator(".subtitle")).toContainText("No. 42 · Shiny");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  const before = await popup.boundingBox();
  for (const selector of [".bsell-name", ".kc-img"]) {
    await rows.nth(1).locator(selector).hover();
    await expect(popup.locator("h2")).toHaveText("Andromeda");
    await expect(popup.locator(".subtitle")).toContainText("No. 46 · Full art");
    expect(await popup.boundingBox()).toEqual(before);
  }
  await expect(
    page.getByLabel("Starting price for Northern Lights", { exact: true }),
  ).toHaveValue("12.00");
  await expect(
    page.getByLabel("Starting price for Andromeda", { exact: true }),
  ).toHaveValue("12.00");
  await expect(page.locator("body")).toHaveAttribute("data-copy-clicks", "0");
  await page.screenshot({
    path: "test-results/screenshots/sell-many-batch.png",
  });
  await page
    .getByLabel("Starting price for Northern Lights", { exact: true })
    .fill("17.50");
  await expect(popup.locator("h2")).toHaveText("Andromeda");
  await page
    .getByRole("button", {
      name: "Choose copy of Northern Lights",
      exact: true,
    })
    .click();
  await expect(page.locator("body")).toHaveAttribute("data-copy-clicks", "1");
  await expect(
    page.getByLabel("Starting price for Northern Lights", { exact: true }),
  ).toHaveValue("17.50");
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-submitted",
    "true",
  );
  expect(writeRequests).toBe(0);
});
test("sales badges fill only their own controlled batch price fields with independent adjustments", async () => {
  await page.route("**/api/auctions?**", async (route) => {
    const first =
      new URL(route.request().url()).searchParams.get("q") ===
      "Northern Lights";
    await route.fulfill({
      json: {
        items: [
          auction(1, first ? "42" : "46", {
            startPrice: first ? "8000000" : "20000000",
          }),
        ],
        nextOffset: null,
      },
    });
  });
  const options = await context.newPage();
  try {
    await page.goto("https://kosmora.io/market/sell/batch?s=42.v,46.f");
    const rows = page.locator(".bsell-row"),
      first = rows.nth(0),
      second = rows.nth(1);
    const lastSale = first.getByRole("button", { name: /^Last Sale \$12/ });
    const lowest = first.getByRole("button", { name: /^Lowest Listed \$8/ });
    await expect(lastSale).toBeEnabled();
    await expect(lowest).toBeEnabled();
    await expect(first.locator("input")).toHaveValue("12.00");
    const group = (await first.locator(".bsell-prices").boundingBox())!,
      badges = (await first
        .locator("[data-kosmore-sales-overlay]")
        .boundingBox())!;
    expect(badges.y).toBeGreaterThanOrEqual(group.y + group.height);
    await lastSale.click();
    await expect(first.locator("input")).toHaveValue("12");
    await expect(second.locator("input")).toHaveValue("12.00");
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { priceModel: Record<string, string> })
            .priceModel["Starting price for Northern Lights"],
      ),
    ).toBe("12");
    await lowest.click();
    await expect(first.locator("input")).toHaveValue("8");
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const settings = options.locator("#sales-overlay");
    await expect(
      settings.getByLabel("Last Sale price adjustment", { exact: true }),
    ).toHaveValue("0");
    await expect(
      settings.getByLabel("Lowest Listed price adjustment", { exact: true }),
    ).toHaveValue("0");
    await settings
      .getByLabel("Last Sale price adjustment", { exact: true })
      .fill("-1");
    await settings
      .getByLabel("Lowest Listed price adjustment", { exact: true })
      .fill("2");
    await settings
      .getByRole("button", { name: "Save sales overlay settings", exact: true })
      .click();
    await expect(settings.getByRole("status")).toContainText("Saved.");
    await first.getByRole("button", { name: /^Last Sale \$12/ }).click();
    await expect(first.locator("input")).toHaveValue("11");
    await second.getByRole("button", { name: /^Lowest Listed \$20/ }).click();
    await expect(second.locator("input")).toHaveValue("22");
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { priceModel: Record<string, string> })
            .priceModel["Starting price for Andromeda"],
      ),
    ).toBe("22");
    await expect(first.locator(".price-badge.sale")).toContainText("$12");
    await expect(second.locator(".price-badge.auction")).toContainText("$20");
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: "test-results/screenshots/sales-badges-batch.png",
    });
    await options
      .getByRole("link", { name: "Sales Overlay", exact: true })
      .click();
    await options.screenshot({
      path: "test-results/screenshots/sales-overlay-settings.png",
    });
    await options.setViewportSize({ width: 390, height: 900 });
    await options
      .getByRole("link", { name: "Sales Overlay", exact: true })
      .click();
    await options.screenshot({
      path: "test-results/screenshots/sales-overlay-settings-390.png",
    });
    expect(
      await options.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-submitted",
      "true",
    );
    await expect(page.locator("body")).toHaveAttribute("data-copy-clicks", "0");
    expect(writeRequests).toBe(0);
  } finally {
    await options.close();
    await page.unroute("**/api/auctions?**");
  }
});
test("my last listing fills only its card, shares sale settings, and uses starting prices on both sale screens", async () => {
  let reads = 0;
  await page.route("**/api/me/auctions?**", (route) => {
    reads++;
    return route.fulfill({
      json: myListingPage([
        myListing(90, "42", {
          startPrice: "17123456",
          finalPrice: "999000000",
          state: "sold",
          group: "sold",
        }),
        myListing(91, "46", { startPrice: "23000000" }),
      ]),
    });
  });
  const options = await context.newPage();
  try {
    await worker.evaluate(async () => {
      const saved = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as object;
      await chrome.storage.local.set({
        "kosmore.settings": {
          ...saved,
          showSalesLastSale: false,
          showSalesLowestListing: false,
        },
      });
    });
    await page.goto("https://kosmora.io/market/sell/batch?s=42.v,46.f");
    const first = page.locator(".bsell-row").nth(0),
      second = page.locator(".bsell-row").nth(1);
    await expect(
      first.getByRole("button", { name: /^My Last Listing: \$17/ }),
    ).toBeEnabled();
    await expect(
      second.getByRole("button", { name: /^My Last Listing: \$23/ }),
    ).toBeEnabled();
    expect(reads).toBe(1);
    await expect(first.locator("input")).toHaveValue("12.00");
    await first.getByRole("button", { name: /^My Last Listing: \$17/ }).click();
    await expect(first.locator("input")).toHaveValue("17.123456");
    await expect(second.locator("input")).toHaveValue("12.00");
    await options.goto(
      `chrome-extension://${extensionId}/options.html#sales-overlay`,
    );
    const group = options.locator("#sales-overlay"),
      adjust = group.getByLabel("My Last Listing price adjustment", {
        exact: true,
      });
    await expect(adjust).toHaveValue("0");
    await adjust.fill("-0.123456");
    await group
      .getByRole("button", { name: "Save sales overlay settings", exact: true })
      .click();
    await first.getByRole("button", { name: /^My Last Listing: \$17/ }).click();
    await expect(first.locator("input")).toHaveValue("17");
    const click = group.getByRole("switch", {
      name: "Set price when My Last Listing is clicked",
      exact: true,
    });
    await click.uncheck();
    await expect(adjust).toBeDisabled();
    await group
      .getByRole("button", { name: "Save sales overlay settings", exact: true })
      .click();
    await expect(first.locator(".price-badge.history")).toHaveAttribute(
      "role",
      "img",
    );
    await click.check();
    await group
      .getByRole("button", { name: "Save sales overlay settings", exact: true })
      .click();
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: "test-results/screenshots/my-last-listing-batch.png",
    });
    await group.screenshot({
      path: "test-results/screenshots/my-last-listing-settings.png",
    });
    await page.goto("https://kosmora.io/market/sell?subject=42");
    const start = page.getByTestId("sell-start"),
      badge = page.getByRole("button", { name: /^My Last Listing: \$17/ });
    await expect(badge).toBeEnabled();
    await badge.click();
    await expect(start).toHaveValue("17");
    await expect(page.getByTestId("t3-sell-reserve")).toHaveValue("20");
    await start.evaluate((el) => el.setAttribute("readonly", ""));
    await expect(badge).toBeDisabled();
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-submitted",
      "true",
    );
    expect(writeRequests).toBe(0);
    await group
      .getByLabel("Show My Last Listing price", { exact: true })
      .uncheck();
    await group
      .getByRole("button", { name: "Save sales overlay settings", exact: true })
      .click();
    await expect(page.locator("[data-kosmore-sales-overlay]")).toHaveCount(0);
  } finally {
    await options.close();
    await page.unroute("**/api/me/auctions?**");
  }
});

test("listing performance: saved sale prices appear during revalidation and successful listing writes invalidate them", async () => {
  let reads = 0,
    price = "17000000",
    hold = false,
    release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/me/auctions?**", async (route) => {
    reads++;
    if (hold) await held;
    await route.fulfill({
      json: myListingPage([myListing(4000, "42", { startPrice: price })]),
    });
  });
  await page.route("https://kosmora.io/api/auctions", (route) =>
    route.fulfill({ json: { auctionId: myListing(4001).id } }),
  );
  await page.route("https://kosmora.io/api/auctions/quote", (route) =>
    route.fulfill({ json: { auctionId: myListing(4001).id } }),
  );
  try {
    await worker.evaluate(async () => {
      const saved = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as object;
      await chrome.storage.local.set({
        "kosmore.settings": {
          ...saved,
          showSalesLastSale: false,
          showSalesLowestListing: false,
        },
      });
    });
    await page.goto("https://kosmora.io/market/sell?subject=42");
    const badge = page.locator(
      "[data-kosmore-sales-overlay] .price-badge.history",
    );
    await expect(badge).toContainText("$17");
    expect(reads).toBe(1);
    await page.reload();
    await expect(badge).toContainText("$17");
    expect(reads).toBe(1);
    await worker.evaluate(async () => {
      const key = "kosmore.myListingPrices",
        data = (await chrome.storage.local.get(key))[key] as {
          entries: Record<string, { checkedAt: number }>;
        };
      data.entries["fixtureplayer:42"].checkedAt = Date.now() - 300_001;
      await chrome.storage.local.set({ [key]: data });
      const sessionKey = "kosmore.listingHistory.fixtureplayer",
        batch = (await chrome.storage.session.get(sessionKey))[sessionKey] as {
          fetchedAt: number;
        };
      batch.fetchedAt = Date.now() - 300_001;
      await chrome.storage.session.set({ [sessionKey]: batch });
    });
    price = "23000000";
    hold = true;
    await page.reload();
    await expect(badge).toContainText("$17");
    await expect(badge).toBeEnabled();
    await expect.poll(() => reads).toBe(2);
    release();
    await expect(badge).toContainText("$23");
    hold = false;
    await page.getByTestId("sell-start").fill("99");
    await page.evaluate(() =>
      fetch("/api/auctions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    await page.waitForTimeout(180);
    expect(reads).toBe(2);
    price = "29000000";
    await page.evaluate(() =>
      fetch("/api/auctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    await expect(badge).toContainText("$29");
    expect(reads).toBe(3);
    await expect(page.getByTestId("sell-start")).toHaveValue("99");
    await badge.click();
    await expect(page.getByTestId("sell-start")).toHaveValue("29");
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-submitted",
      "true",
    );
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: "test-results/screenshots/last-listing-cached-single.png",
    });
  } finally {
    release();
    await page.unroute("**/api/me/auctions?**");
    await page.unroute("https://kosmora.io/api/auctions");
    await page.unroute("https://kosmora.io/api/auctions/quote");
  }
});

test("card and sales overlays remain independent of the hover-tooltip switch", async () => {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        enabled: false,
        showQuestOverlay: true,
      },
    });
  });
  await page.goto("https://kosmora.io/collection");
  const quest = page.locator("[data-kosmore-card-overlays] .quest");
  await expect(quest).toBeVisible();
  await page.locator(".kc-article").hover();
  await expect(page.locator("#kosmore-root")).toHaveCount(0);
  await page.goto(
    `https://kosmora.io/market/sell?subject=42&instance=${COPY_A}`,
  );
  const sales = page.locator("[data-kosmore-sales-overlay]");
  await expect(sales.getByRole("button", { name: /^Last Sale/ })).toBeEnabled();
  await expect(
    sales.getByRole("button", { name: /^Lowest Listed/ }),
  ).toBeEnabled();
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        salesOverlaysEnabled: false,
        cardOverlaysEnabled: false,
      },
    });
  });
  await expect(sales).toHaveCount(0);
  await page.goto("https://kosmora.io/collection");
  await expect(quest).toHaveCount(0);
  expect(writeRequests).toBe(0);
});

test("single-sale badges share settings and respect click toggles, visibility, readonly inputs and nonpositive adjustments", async () => {
  const options = await context.newPage();
  try {
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const settings = options.locator("#sales-overlay"),
      save = settings.getByRole("button", {
        name: "Save sales overlay settings",
        exact: true,
      });
    await settings
      .getByLabel("Last Sale price adjustment", { exact: true })
      .fill("-1");
    await settings
      .getByLabel("Lowest Listed price adjustment", { exact: true })
      .fill("2");
    await save.click();
    await page.goto(
      `https://kosmora.io/market/sell?subject=42&instance=${COPY_A}`,
    );
    const input = page.getByTestId("sell-start"),
      widget = page.locator("[data-kosmore-sales-overlay]");
    await widget.getByRole("button", { name: /^Last Sale \$12/ }).click();
    await expect(input).toHaveValue("11");
    await widget.getByRole("button", { name: /^Lowest Listed \$10/ }).click();
    await expect(input).toHaveValue("12");
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { priceModel: Record<string, string> })
            .priceModel["Starting price"],
      ),
    ).toBe("12");
    await expect(page.getByTestId("t3-sell-reserve")).toHaveValue("20");
    await input.evaluate((el) => {
      (el as HTMLInputElement).readOnly = true;
    });
    await expect(
      widget.getByRole("button", { name: /^Last Sale/ }),
    ).toBeDisabled();
    await input.evaluate((el) => {
      (el as HTMLInputElement).readOnly = false;
    });
    await expect(
      widget.getByRole("button", { name: /^Last Sale/ }),
    ).toBeEnabled();
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: "test-results/screenshots/sales-badges-single.png",
    });
    await settings
      .getByLabel("Last Sale price adjustment", { exact: true })
      .fill("-20");
    await save.click();
    await widget.getByRole("button", { name: /^Last Sale/ }).click();
    await expect(input).toHaveValue("12");
    await expect(widget.getByRole("status")).toContainText("greater than 0");
    await settings
      .getByRole("switch", {
        name: "Set price when Last Sale is clicked",
        exact: true,
      })
      .uncheck();
    await expect(
      settings.getByLabel("Last Sale price adjustment", { exact: true }),
    ).toBeDisabled();
    await save.click();
    await expect(widget.locator(".sale")).toContainText("$12");
    await expect(
      widget.getByRole("button", { name: /^Last Sale/ }),
    ).toHaveCount(0);
    await widget.locator(".sale").click();
    await expect(input).toHaveValue("12");
    await settings
      .getByRole("checkbox", { name: "Show Lowest Listed price", exact: true })
      .uncheck();
    await expect(
      settings.getByRole("switch", {
        name: "Set price when Lowest Listed is clicked",
        exact: true,
      }),
    ).toBeDisabled();
    await save.click();
    await expect(widget.locator(".auction")).toHaveCount(0);
    await settings
      .getByRole("switch", { name: "Enable sales overlay", exact: true })
      .uncheck();
    await expect(settings).toHaveClass(/settings-group-disabled/);
    await expect(save).toBeDisabled();
    await expect(widget).toHaveCount(0);
    await options.reload();
    await expect(
      settings.getByLabel("Last Sale price adjustment", { exact: true }),
    ).toHaveValue("-20");
    await expect(
      settings.getByRole("switch", {
        name: "Enable sales overlay",
        exact: true,
      }),
    ).not.toBeChecked();
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-submitted",
      "true",
    );
    expect(writeRequests).toBe(0);
  } finally {
    await options.close();
  }
});
test("late sales prices cannot populate a replaced batch row or edit a new card automatically", async () => {
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/collection/42", async (route) => {
    started();
    await held;
    await route.fulfill({ json: card("42") });
  });
  await page.route("**/api/cards/*/prices?**", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3],
      data = prices(1);
    data.prices.sales[0].price = id === "42" ? "90000000" : "7000000";
    await route.fulfill({ json: data });
  });
  try {
    await page.goto("https://kosmora.io/market/sell/batch?s=42.v,46.f");
    await ready;
    const oldInput = await page
      .locator(".bsell-row input")
      .first()
      .elementHandle();
    await page
      .locator(".bsell-row")
      .first()
      .evaluate(
        (row, html) => {
          row.outerHTML = html;
        },
        batchSellRow("47", "Orion Nebula"),
      );
    release();
    const first = page.locator(".bsell-row").first();
    await expect(first.locator("[data-kosmore-sales-overlay]")).toHaveAttribute(
      "data-subject",
      "47",
    );
    await expect(
      first.getByRole("button", { name: /^Last Sale \$7/ }),
    ).toBeEnabled();
    await expect(first.locator(".price-badge.sale")).not.toContainText("$90");
    await expect(first.locator("input")).toHaveValue("12.00");
    expect(await oldInput!.evaluate((el) => el.isConnected)).toBe(false);
    await first.getByRole("button", { name: /^Last Sale \$7/ }).click();
    await expect(first.locator("input")).toHaveValue("7");
    await expect(
      page.locator(".bsell-row").nth(1).locator("input"),
    ).toHaveValue("12.00");
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-submitted",
      "true",
    );
    expect(writeRequests).toBe(0);
  } finally {
    release();
    await page.unroute("**/api/collection/42");
    await page.unroute("**/api/cards/*/prices?**");
  }
});
test("listed-price links open encoded market searches and header indicators match their card overlays", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...saved,
        showActiveAuctionsOverlay: true,
        showSaleHistoryOverlay: true,
        showFriendInterestOverlay: true,
        showQuestOverlay: true,
      },
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "",
        families: ["Astronomy"],
      },
    });
  });
  let name = "George Wade",
    nativeClicks = 0;
  await page.exposeFunction("recordNativeCardClick", () => {
    nativeClicks++;
  });
  await page.route("**/api/collection/*", async (route) =>
    route.fulfill({ json: { ...card(), name } }),
  );
  await page.route("**/market?**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: "<html><body><h1>Market</h1></body></html>",
    });
  });
  try {
    await page.goto("https://kosmora.io/collection");
    await page.evaluate(
      (html) => {
        document.body.dataset.nativeClicks = "0";
        document.querySelector("main")!.innerHTML = html;
      },
      `<a href="/card/42" style="display:block;width:270px" onclick="window.recordNativeCardClick()">${face("42", name)}</a>`,
    );
    const cardRoot = page.locator(".kc-article"),
      link = cardRoot.locator("[data-kosmore-card-overlays] a.auction");
    await expect(link).toHaveAttribute("href", "/market?q=George+Wade");
    await cardRoot.hover();
    const popup = page.locator("#kosmore-root");
    await expect(popup.locator(".header-signals .signal-badge")).toHaveCount(2);
    await expect(
      popup.locator(
        ".header-signals .auction,.header-signals .sale,.top .sell-button",
      ),
    ).toHaveCount(0);
    await expect(
      popup
        .locator(".footer")
        .getByRole("button", { name: "Sell card", exact: true }),
    ).toBeVisible();
    for (const kind of ["quest", "friend"]) {
      const styles = (el: Element) => {
        const badge = getComputedStyle(el),
          icon = getComputedStyle(el.querySelector("svg")!);
        return {
          color: icon.color,
          border: badge.borderColor,
          background: badge.backgroundColor,
        };
      };
      expect(
        await popup.locator(`.header-signals .${kind}`).evaluate(styles),
      ).toEqual(
        await cardRoot
          .locator(`[data-kosmore-card-overlays] .${kind}`)
          .evaluate(styles),
      );
    }
    for (const [kind, selector] of [
      ["sale", ".last-sold"],
      ["auction", ".listed-for"],
    ])
      expect(
        await popup
          .locator(selector)
          .evaluate((el) => getComputedStyle(el.querySelector("svg")!).color),
      ).toBe(
        await cardRoot
          .locator(`[data-kosmore-card-overlays] .${kind} svg`)
          .evaluate((el) => getComputedStyle(el).color),
      );
    await mkdir("test-results/screenshots", { recursive: true });
    await popup.screenshot({
      path: "test-results/screenshots/tooltip-market-links.png",
    });
    await page.keyboard.press("Escape");
    await link.click();
    await expect(page).toHaveURL("https://kosmora.io/market?q=George+Wade");
    expect(nativeClicks).toBe(0);
    name = "A & B, C / D?";
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const listed = page.locator("#kosmore-root .listed-for");
    await expect(listed).toHaveAttribute(
      "href",
      "/market?q=A+%26+B%2C+C+%2F+D%3F",
    );
    await listed.focus();
    await listed.press("Enter");
    await expect(page).toHaveURL(
      "https://kosmora.io/market?q=A+%26+B%2C+C+%2F+D%3F",
    );
    expect(new URL(page.url()).searchParams.get("q")).toBe(name);
    expect(writeRequests).toBe(0);
  } finally {
    await page.unroute("**/api/collection/*");
    await page.unroute("**/market?**");
  }
});
test("listed-price links work through multi-select without toggling a card selection", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": { ...saved, showActiveAuctionsOverlay: true },
    });
  });
  await page.route("**/collection", (route) =>
    route.fulfill({ contentType: "text/html", body: multiSelectFixture() }),
  );
  let selection: (string | null)[] = [];
  await page.exposeFunction(
    "recordMarketSelection",
    (values: (string | null)[]) => {
      selection = values;
    },
  );
  await page.route("**/market?**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: "<html><body><h1>Market</h1></body></html>",
    });
  });
  try {
    await page.goto("https://kosmora.io/collection");
    const first = page.locator(".kc-article").first();
    await first.hover();
    await page.mouse.down();
    await page.waitForTimeout(550);
    await page.mouse.up();
    await expect(page.locator(".pick-hit").first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.evaluate(() => {
      window.addEventListener(
        "beforeunload",
        () => {
          void (
            window as unknown as {
              recordMarketSelection: (
                values: (string | null)[],
              ) => Promise<void>;
            }
          ).recordMarketSelection(
            [...document.querySelectorAll(".pick-hit")].map((b) =>
              b.getAttribute("aria-pressed"),
            ),
          );
        },
        { once: true },
      );
    });
    await page
      .locator(".pick")
      .first()
      .locator("[data-kosmore-card-overlays] a.auction")
      .click();
    await expect(page).toHaveURL("https://kosmora.io/market?q=Northern+Lights");
    await expect.poll(() => selection).toEqual(["true", "false"]);
    expect(writeRequests).toBe(0);
  } finally {
    await page.unroute("**/collection");
    await page.unroute("**/market?**");
  }
});
test("sale screens show only badges for confirmed market history and active auctions", async () => {
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/cards/*/prices?**", async (route) => {
    const url = new URL(route.request().url()),
      id = url.pathname.split("/")[3];
    if (id === "42" && url.searchParams.get("finish") === "fullart") {
      started();
      await held;
    }
    await route.fulfill({ json: prices(id === "46" ? 1 : 0) });
  });
  await page.route("**/api/auctions?**", async (route) => {
    const first =
      new URL(route.request().url()).searchParams.get("q") ===
      "Northern Lights";
    await route.fulfill({
      json: { items: first ? [auction(1)] : [], nextOffset: null },
    });
  });
  try {
    await page.goto("https://kosmora.io/market/sell/batch?s=42.v,46.f");
    await ready;
    const first = page.locator(".bsell-row").nth(0),
      second = page.locator(".bsell-row").nth(1);
    await expect(first.locator(".price-badge")).toHaveCount(0);
    release();
    await expect(first.locator(".price-badge.auction")).toBeVisible();
    await expect(second.locator(".price-badge.sale")).toBeVisible();
    await expect(first.locator(".price-badge.sale")).toHaveCount(0);
    await expect(second.locator(".price-badge.auction")).toHaveCount(0);
    await expect(first.locator("input")).toHaveValue("12.00");
    await expect(second.locator("input")).toHaveValue("12.00");
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: "test-results/screenshots/sales-badges-confirmed-only.png",
    });
    await page.goto(
      `https://kosmora.io/market/sell?subject=42&instance=${COPY_A}`,
    );
    await expect(
      page.locator("[data-kosmore-sales-overlay] .auction"),
    ).toBeVisible();
    await expect(
      page.locator("[data-kosmore-sales-overlay] .sale"),
    ).toHaveCount(0);
    await page.goto(
      `https://kosmora.io/market/sell?subject=46&instance=${COPY_A}`,
    );
    await expect(
      page.locator("[data-kosmore-sales-overlay] .sale"),
    ).toBeVisible();
    await expect(
      page.locator("[data-kosmore-sales-overlay] .auction"),
    ).toHaveCount(0);
    await page.goto(
      `https://kosmora.io/market/sell?subject=47&instance=${COPY_A}`,
    );
    await expect(page.locator("[data-kosmore-sales-overlay]")).toHaveAttribute(
      "hidden",
      "",
    );
    await expect(page.locator("[data-kosmore-sales-overlay]")).toBeHidden();
    await expect(
      page.locator("[data-kosmore-sales-overlay] .price-badge"),
    ).toHaveCount(0);
    await expect(page.getByTestId("sell-start")).toHaveValue("12.00");
    expect(writeRequests).toBe(0);
  } finally {
    release();
    await page.unroute("**/api/cards/*/prices?**");
    await page.unroute("**/api/auctions?**");
  }
});
test("performance: visible cards load concurrently without per-card pauses or full scans for unrelated updates", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": { ...saved, showOnSaleOverlay: true },
    });
  });
  let active = 0,
    peak = 0,
    requests = 0,
    firstRequest = 0;
  await page.route("**/api/collection/*", async (route) => {
    if (!firstRequest) firstRequest = Date.now();
    requests++;
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const data = card(id);
    await route.fulfill({
      json: {
        ...data,
        copies: data.copies.map((copy) => ({
          ...copy,
          auction_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        })),
      },
    });
    active--;
  });
  try {
    await page.goto("https://kosmora.io/collection");
    await page.mouse.move(0, 0);
    await page.locator("main").evaluate(
      (main, html) => {
        main.innerHTML = html;
      },
      '<div id="clock">Loading</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">' +
        Array.from(
          { length: 20 },
          (_, i) =>
            '<a href="/card/' +
            (100 + i) +
            '">' +
            face(String(100 + i), "Card " + i) +
            "</a>",
        ).join("") +
        "</div><style>.kc-img{height:50px}.kc-name{font-size:12px;margin:0}.kc-article{padding:2px}</style>",
    );
    await expect(
      page.locator("[data-kosmore-card-overlays] .on-sale"),
    ).toHaveCount(20);
    const elapsed = Date.now() - firstRequest;
    expect(peak).toBeGreaterThanOrEqual(2);
    expect(peak).toBeLessThanOrEqual(3);
    expect(elapsed).toBeLessThan(4000);
    expect(requests).toBeGreaterThanOrEqual(20);
    console.log(
      JSON.stringify({
        visibleCards: 20,
        overlayLoadMs: elapsed,
        peakConcurrentCardReads: peak,
      }),
    );
    const scans = await page.evaluate(async () => {
      let scans = 0;
      const query = Document.prototype.querySelectorAll;
      Document.prototype.querySelectorAll = function <
        T extends Element = Element,
      >(selector: string): NodeListOf<T> {
        if (selector.includes(".kc-article")) scans++;
        return query.call(this, selector) as NodeListOf<T>;
      };
      try {
        document.querySelector("#clock")!.textContent = "Updated";
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return scans;
      } finally {
        Document.prototype.querySelectorAll = query;
      }
    });
    expect(scans).toBe(0);
    expect(writeRequests).toBe(0);
  } finally {
    await page.unroute("**/api/collection/*");
  }
});

test("performance: repeat hovers reuse reads and album data loads only when pinned albums need it", async () => {
  const counts = new Map<string, number>();
  const count = (request: import("@playwright/test").Request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/"))
      counts.set(
        url.pathname + url.search,
        (counts.get(url.pathname + url.search) ?? 0) + 1,
      );
  };
  page.on("request", count);
  try {
    await page.goto("https://kosmora.io/collection");
    const cardRoot = page.locator(".kc-article");
    const popup = page.locator("#kosmore-root");
    await cardRoot.hover();
    await expect(popup.locator(".listed-for")).toContainText("$10");
    await expect(popup.locator(".album-add")).toHaveCount(2);
    await expect(popup.locator(".last-sold")).toContainText("$12");
    const first = [...counts.entries()];
    await page.keyboard.press("Escape");
    await page.mouse.move(0, 0);
    await cardRoot.hover();
    await expect(popup.locator(".listed-for")).toContainText("$10");
    await expect(popup.locator(".album-add")).toHaveCount(2);
    expect([...counts.entries()]).toEqual(first);
    await page.keyboard.press("Escape");
    await worker.evaluate(async () => {
      const saved = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as object;
      await chrome.storage.local.set({
        "kosmore.settings": { ...saved, pinnedAlbums: {} },
      });
    });
    await page.reload();
    counts.clear();
    await cardRoot.hover();
    await expect(
      popup.getByRole("button", { name: "Choose pinned albums", exact: true }),
    ).toBeVisible();
    await expect(popup.locator(".listed-for")).toContainText("$10");
    expect(
      [...counts.keys()].some((path) => path.startsWith("/api/albums")),
    ).toBe(false);
    // Enabling pins in an already open popup must trigger its deferred album read.
    await worker.evaluate(async (a) => {
      const saved = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as object;
      await chrome.storage.local.set({
        "kosmore.settings": { ...saved, pinnedAlbums: { fixtureplayer: [a] } },
      });
    }, ALBUM_A);
    await expect(popup.locator(".album-add")).toContainText(
      "Space & discovery",
    );
    expect(
      [...counts.keys()].some((path) => path.startsWith("/api/albums")),
    ).toBe(true);
    expect(writeRequests).toBe(0);
  } finally {
    page.off("request", count);
  }
});

test("performance: quest badges appear before slow market results and survive a focus refresh", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...saved,
        showQuestOverlay: true,
        showActiveAuctionsOverlay: true,
      },
    });
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auctions?**", async (route) => {
    await held;
    await route.fulfill({ json: auctionPage() });
  });
  try {
    await page.goto("https://kosmora.io/collection");
    const quest = page.locator("[data-kosmore-card-overlays] .quest");
    await expect(quest).toBeVisible();
    const host = await page
      .locator("[data-kosmore-card-overlays]")
      .elementHandle();
    await expect(
      page.locator("[data-kosmore-card-overlays] .auction"),
    ).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect(await host!.evaluate((el) => el.isConnected)).toBe(true);
    release();
    await expect(
      page.locator("[data-kosmore-card-overlays] .auction"),
    ).toBeVisible();
    expect(await host!.evaluate((el) => el.isConnected)).toBe(true);
    expect(writeRequests).toBe(0);
  } finally {
    release();
    await page.unroute("**/api/auctions?**");
  }
});

test("sale rate: relays the page's own auction reads and settles them per finish from fresh histories", async () => {
  // Start from an empty observation log.
  await worker.evaluate(async () => {
    const keys = Object.keys(await chrome.storage.local.get(null)).filter((k) =>
      k.startsWith("kosmore.marketOutcomes."),
    );
    await chrome.storage.local.remove(keys);
  });
  const ended = new Date(Date.now() - 30 * 60_000).toISOString();
  const listings = {
    items: [
      // In the fixture's sales (prices(3) sells auction IDs ...000-...002): sold.
      auction(1, "42", { endsAt: ended }),
      // Absent from complete Standard and Shiny histories: unsold.
      auction(905, "42", { endsAt: ended }),
      auction(906, "42", { endsAt: ended, veil: true }),
      // Another card: must not count for card 42.
      auction(907, "43", { endsAt: ended }),
    ],
    nextOffset: null,
  };
  await page.route("https://kosmora.io/api/auctions*", (route) =>
    route.fulfill({ json: listings }),
  );
  try {
    await page.goto("https://kosmora.io/collection");
    await page.locator(".kc-article").hover();
    const popup = page.locator("#kosmore-root");
    await expect(popup.locator(".stats")).toContainText("Standard");
    // The page itself reads the market; the relay forwards a copy.
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/auctions?sort=ending&offset=0");
      return (await res.json()).items.length;
    });
    expect(status).toBe(4); // the page still receives its full response
    // Fresh histories settle the ended listings.
    await popup.getByRole("button", { name: "Refresh" }).click();
    const rows = popup.locator(".stats tbody tr");
    await expect(
      rows.filter({ hasText: "Standard" }).locator(".sale-rate"),
    ).toHaveText("50% (2)");
    await expect(
      rows.filter({ hasText: "Shiny" }).locator(".sale-rate"),
    ).toHaveText("0% (1)");
    await expect(
      rows.filter({ hasText: "Full art" }).locator(".sale-rate"),
    ).toHaveText("—");
    await expect(
      popup.locator('.metric[data-stat-id="saleRate"] strong'),
    ).toHaveText("33% · 3");
    // Persisted (after the save delay) per day of listing end.
    await expect
      .poll(
        () =>
          worker.evaluate(async () =>
            Object.keys(await chrome.storage.local.get(null)).filter((k) =>
              k.startsWith("kosmore.marketOutcomes."),
            ),
          ),
        { timeout: 8000 },
      )
      .toEqual([`kosmore.marketOutcomes.${ended.slice(0, 10)}`]);
  } finally {
    await page.unroute("https://kosmora.io/api/auctions*");
  }
});

test("fusion family impact: marks tiles safe or not from the page's own reads, follows the tray, never blocks picks, and fits narrow cards", async () => {
  let familyReads = 0;
  await page.route("https://kosmora.io/fusion", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: fusionFixture(),
    }),
  );
  await page.route("https://kosmora.io/api/fusion/cards*", (route) =>
    route.fulfill({ json: fusionGrid }),
  );
  await page.route("https://kosmora.io/api/fusion", (route) =>
    route.fulfill({ json: fusionRecipes }),
  );
  await page.route("https://kosmora.io/api/families", (route) =>
    route.fulfill({ json: familyMilestones }),
  );
  let cardReads = 0;
  await page.route("https://kosmora.io/api/collection/30*", (route) => {
    cardReads++;
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    return route.fulfill({
      json: { ...card(id), families: fusionMembership[id] },
    });
  });
  await page.route("https://kosmora.io/api/me/families*", (route) => {
    familyReads++;
    return route.fulfill({ json: myFamilies });
  });
  const tile = (id: string) => page.locator(`.grid .pick[data-id="${id}"]`);
  const badge = (id: string) =>
    tile(id).locator(".kc-article [data-kosmore-fusion-family] .verdict");
  try {
    await page.goto("https://kosmora.io/fusion");
    // Asteroids 4 (floor 2): two can go. Parrots 2: its only card drops it.
    await expect(badge("304")).toHaveText("⚠ LosesParrotsI");
    await expect(badge("304")).toHaveClass(/drop/);
    await expect(badge("304")).toHaveAttribute(
      "aria-label",
      "Not safe: picking this card drops Parrots from tier I to no tier.",
    );
    // Its primary family keeps tier II, but its sub-family MAMA Awards drops.
    await expect(badge("307")).toHaveText("⚠ LosesMAMA AwardsI");
    // Asteroids, no family (305) and room to spare (306): safe.
    for (const id of ["301", "302", "303", "305", "306"]) {
      await expect(badge(id)).toHaveText("✓ Safe");
      await expect(badge(id)).toHaveClass(/safe/);
    }
    expect(familyReads).toBe(1);
    expect(cardReads).toBeLessThanOrEqual(7); // once per card at most
    expect(writeRequests).toBe(0);

    // Clicking right on a badge still picks the card underneath.
    const at = (await badge("301").boundingBox())!;
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    await expect(tile("301")).toHaveClass(/pick-on/);
    await expect(badge("302")).toHaveText("✓ Safe");
    await tile("302").locator(".pick-hit").click();
    await expect(badge("303")).toHaveText("⚠ LosesAsteroidsI");
    await expect(badge("303")).toHaveClass(/drop/);
    await expect(badge("301")).toHaveText("✓ Safe");
    // A third pick waits for a partner (two per fusion): marked as waiting,
    // and it does not count against the two being fused.
    await tile("303").locator(".pick-hit").click();
    await expect(badge("303")).toHaveClass(/wait/);
    await expect(badge("303")).toHaveAttribute(
      "aria-label",
      /^Not in this fusion yet: the game fuses 2 cards at a time/,
    );
    await expect(badge("301")).toHaveText("✓ Safe");
    await expect(badge("301")).not.toHaveClass(/wait/);
    await tile("303").locator(".pick-hit").click();
    await expect(badge("303")).not.toHaveClass(/wait/);
    // Taking a card back out restores the third one.
    await tile("302").locator(".pick-hit").click();
    await expect(badge("303")).toHaveText("✓ Safe");
    await tile("301").locator(".pick-hit").click();
    await expect(badge("303")).toHaveText("✓ Safe");
    expect(writeRequests).toBe(0);

    // Narrow cards: the badge stays inside the card, leaves the bottom-right
    // badge slots clear, and shortens a long family name.
    // The long family exactly at 25: its card drops tier IV.
    await page.unroute("https://kosmora.io/api/me/families*");
    await page.route("https://kosmora.io/api/me/families*", (route) =>
      route.fulfill({
        json: {
          ...myFamilies,
          families: myFamilies.families.map((f) =>
            f.id === "sports.long" ? { ...f, collected: 25 } : f,
          ),
        },
      }),
    );
    await page.setViewportSize({ width: 420, height: 1000 });
    await page.reload();
    await tile("306").waitFor();
    await page.evaluate(() => {
      const g = document.querySelector(".grid") as HTMLElement;
      g.style.gridTemplateColumns = "repeat(2, 144px)";
    });
    // Badges appear as cards come into view.
    await tile("306").scrollIntoViewIfNeeded();
    await expect(badge("306")).toHaveText(
      `⚠ Loses${FUSION_FAMILIES.long.name}IV`,
    );
    for (const id of ["304", "306"]) {
      await tile(id).scrollIntoViewIfNeeded();
      await expect(badge(id)).toHaveClass(/drop/);
      // On the card art: inside it, so no card text is covered.
      const art = (await tile(id).locator(".kc-window").boundingBox())!;
      const box = (await badge(id).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(art.x);
      expect(box.x + box.width).toBeLessThanOrEqual(art.x + art.width);
      expect(box.y).toBeGreaterThanOrEqual(art.y);
      expect(box.y + box.height).toBeLessThanOrEqual(art.y + art.height);
    }
    expect(
      await badge("306")
        .locator(".name")
        .evaluate((n) => n.scrollWidth > n.clientWidth),
    ).toBe(true);
    for (const fixed of await badge("306").locator(".fixed").all())
      await expect(fixed).toBeVisible();

    // Fusion is a Card overlays feature, independent of hover tooltips.
    await worker.evaluate(async () => {
      const saved = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as object;
      await chrome.storage.local.set({
        "kosmore.settings": { ...saved, enabled: false },
      });
    });
    await expect(badge("306")).toBeVisible();

    // The setting turns it off without a reload.
    await worker.evaluate(async () => {
      const saved = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as object;
      await chrome.storage.local.set({
        "kosmore.settings": { ...saved, showFusionFamilyOverlay: false },
      });
    });
    await expect(page.locator("[data-kosmore-fusion-family]")).toHaveCount(0);
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const url of [
      "https://kosmora.io/fusion",
      "https://kosmora.io/api/fusion/cards*",
      "https://kosmora.io/api/fusion",
      "https://kosmora.io/api/families",
      "https://kosmora.io/api/me/families*",
      "https://kosmora.io/api/collection/30*",
    ])
      await page.unroute(url);
  }
});

test("persisted settings and listing prices survive a browser restart", async () => {
  await page.route("**/api/me/auctions?**", (route) =>
    route.fulfill({ json: myListingPage([myListing(5000)]) }),
  );
  await page.goto("https://kosmora.io/market/sell?subject=42");
  await expect(page.locator(".price-badge.history")).toContainText("$17");
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ "kosmore.marketFinishes": ["veil"] });
    await chrome.storage.local.set({
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        notes: "Remember after restart",
        families: ["Fish"],
      },
    });
  });
  await context.close();
  context = await launchTestBrowser(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${resolve("dist")}`,
      `--load-extension=${resolve("dist")}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  let personalReads = 0;
  await context.route("https://kosmora.io/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: me });
    if (path === "/api/me/auctions") {
      personalReads++;
      return route.fulfill({ json: myListingPage() });
    }
    if (path.startsWith("/api/")) return route.fulfill({ json: {} });
    if (path.startsWith("/media/"))
      return route.fulfill({ contentType: "image/svg+xml", body: artwork });
    return route.fulfill({
      contentType: "text/html",
      body: singleSellFixture(),
    });
  });
  page = await context.newPage();
  await page.goto("https://kosmora.io/market/sell?subject=42");
  await expect(page.locator(".price-badge.history")).toContainText("$17");
  expect(personalReads).toBe(0);
  const pins = await worker.evaluate(
    async () =>
      (
        (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ] as { pinnedAlbums: Record<string, string[]> }
      ).pinnedAlbums.fixtureplayer,
  );
  expect(pins).toEqual([ALBUM_A, ALBUM_B]);
  expect(
    await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.marketFinishes"))[
          "kosmore.marketFinishes"
        ],
    ),
  ).toEqual(["veil"]);
  expect(
    await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.friend.fixtureplayer.batu"))[
          "kosmore.friend.fixtureplayer.batu"
        ],
    ),
  ).toEqual({
    schemaVersion: 1,
    notes: "Remember after restart",
    families: ["Fish"],
  });
});
