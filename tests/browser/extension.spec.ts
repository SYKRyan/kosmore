import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { launchTestBrowser } from "./browser";
import {
  ALBUM_A,
  ALBUM_B,
  COPY_A,
  COPY_B,
  OPENING,
  albums,
  card,
  face,
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
      if (path === "/api/me") body = { ...me, handle: account };
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
  holdSlow = false;
  inventoryEmpty = false;
  membership = false;
  writeRequests = 0;
  account = "FixturePlayer";
  await worker.evaluate(
    async ({ a, b }) => {
      await chrome.storage.local.set({
        "kosmore.settings": {
          schemaVersion: 1,
          enabled: true,
          hoverDelayMs: 100,
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
  await expect(popup.locator(".error")).toContainText("Shiny:");
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
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(options.getByRole("status")).toContainText("Saved.");
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
    .getByRole("button", { name: "Cancel changes", exact: true })
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
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(options.getByRole("status")).toContainText("Saved.");
  await expect(page.locator("#kosmore-root")).toHaveCount(0);
  await options.close();
  expect(writeRequests).toBe(0);
});
test("persisted settings survive a browser restart", async () => {
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
});
