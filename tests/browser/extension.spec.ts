import { questCatalog } from "../fixtures/quests";
import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Route,
  type Worker,
} from "@playwright/test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { launchTestBrowser } from "./browser";
import { socialFixture } from "../fixtures/social";
import { familyCatalog } from "../fixtures/families";
import { NAVIGATION } from "../../src/shared/hotkeys";
import { sellManyFixture } from "../fixtures/sell-many";
import { multiSelectFixture } from "../fixtures/multi-select";
import {
  activityRow,
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
      } else if (path === "/api/me") body = { ...me, handle: account };
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
    .getByRole("button", { name: "Cancel popup settings changes", exact: true })
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
test("saving disabled hover settings closes an existing popup in an already-open tab", async () => {
  await page.goto("https://kosmora.io/collection");
  await page.locator(".kc-article").hover();
  await expect(page.locator("#kosmore-root")).toBeVisible();
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options
    .getByLabel("Enable card hover popups", { exact: true })
    .uncheck();
  await options
    .getByRole("button", { name: "Save popup settings", exact: true })
    .click();
  await expect(
    options
      .getByRole("region", { name: "popup settings", exact: true })
      .getByRole("status"),
  ).toContainText("Saved.");
  await expect(page.locator("#kosmore-root")).toHaveCount(0);
  await options.close();
  expect(writeRequests).toBe(0);
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
  ).toEqual(["pinned-albums", "stat-area", "tab-workspace", "footer"]);
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
    .getByRole("button", { name: "Save popup settings", exact: true })
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
    popup.getByRole("tab", { name: "Trade", exact: true }),
  ).toBeFocused();
  await expect(
    popup
      .getByRole("list", { name: "Matching friends", exact: true })
      .locator(".friend-link"),
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
      .locator(".friend-link"),
  ).toHaveText(["FriendB"]);
  await popup.getByRole("tab", { name: "Trade", exact: true }).press("Home");
  await expect(
    popup.getByRole("tabpanel", { name: "Market", exact: true }),
  ).toBeVisible();
  await expect(popup.locator(".sales li")).toHaveCount(5);
  expect(writeRequests).toBe(0);
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
test("saved settings independently remove the three card overlays in existing tabs", async () => {
  await worker.evaluate(async () => {
    const settings = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...settings,
        showSaleHistoryOverlay: true,
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
    const width = options.getByLabel("Popup width", { exact: true });
    const height = options.getByLabel("Popup height", { exact: true });
    const dismiss = options.getByLabel("Dismiss delay", { exact: true });
    await expect(width).toHaveValue("440");
    await width.fill("100");
    await options
      .getByRole("button", { name: "Save popup settings", exact: true })
      .click();
    await expect(
      options
        .getByRole("region", { name: "popup settings", exact: true })
        .getByRole("status"),
    ).toContainText("Choose a popup width");
    await width.fill("560");
    await height.fill("760");
    await dismiss.fill("1200");
    await options
      .getByRole("button", { name: "Save popup settings", exact: true })
      .click();
    await expect(
      options
        .getByRole("region", { name: "popup settings", exact: true })
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
        name: "Cancel popup settings changes",
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
  const clamped = (await popup.boundingBox())!;
  expect(clamped.x + clamped.width).toBeLessThanOrEqual(650);
  expect(clamped.y + clamped.height).toBeLessThanOrEqual(700);
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
    await expect(hotkeys.locator(".hotkey-row")).toHaveCount(14);
    await options.getByLabel("Popup width", { exact: true }).fill("600");
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
        name: "Cancel popup settings changes",
        exact: true,
      })
      .click();
    await expect(
      options.getByLabel("Popup width", { exact: true }),
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
      .getByRole("region", { name: "popup settings", exact: true })
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
            name: `Extra album ${i + 1}`,
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
  await expect(popup.locator(".last-sold")).toContainText("Last Sold: $");
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
      options.getByLabel("Popup width", { exact: true }),
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
        options.getByLabel("Popup width", { exact: true }),
      ).toHaveValue(String(after.width));
      await expect(
        options.getByLabel("Popup height", { exact: true }),
      ).toHaveValue(String(after.height));
    }
    await options.getByLabel("Popup width", { exact: true }).fill("555");
    const edge = popup.locator('[data-edge="e"]');
    await edge.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      options.getByLabel("Popup width", { exact: true }),
    ).toHaveValue("555");
    const size = (await popup.boundingBox())!;
    await options
      .getByRole("button", {
        name: "Cancel popup settings changes",
        exact: true,
      })
      .click();
    await expect(
      options.getByLabel("Popup width", { exact: true }),
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
      options.getByLabel("Popup width", { exact: true }),
    ).toHaveValue(String(size.width));
    await expect(
      options.getByLabel("Popup height", { exact: true }),
    ).toHaveValue(String(size.height));
    await page.keyboard.press("Escape");
  } finally {
    await options.close();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  expect(writeRequests).toBe(0);
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
      "Last Sold: $12.35",
    );
    await popup.getByLabel("Full art", { exact: true }).uncheck();
    await expect(popup.locator(".last-sold")).toHaveText("Last Sold: $90.00");
    await popup.getByLabel("Shiny", { exact: true }).uncheck();
    await expect(popup.locator(".last-sold")).toHaveText("Last Sold: $2.00");
    await popup.getByLabel("Standard", { exact: true }).uncheck();
    await expect(popup.locator(".last-sold")).toHaveText("Last Sold: —");
  } finally {
    await page.unroute("**/api/cards/*/prices*");
  }
  expect(writeRequests).toBe(0);
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
      await expect(popup.locator(".last-sold")).toContainText("Last Sold: $");
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
  await expect(popup.locator(".header-signals .sale")).toBeVisible();
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
    await expect(popup.locator(".last-sold")).toContainText("Last Sold: $");
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
test("persisted settings survive a browser restart", async () => {
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
