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
import { saleFamilyFixture, saleFamilyKeys } from "../fixtures/sale-family";
import { singleSellFixture } from "../fixtures/sell-many";
import { card, me, COPY_B, prices } from "../fixtures/data";
import { myListingPage } from "../fixtures/my-listings";
import { familyCatalog } from "../fixtures/families";
import {
  familyMilestones,
  myFamilies,
  fusionMembership,
} from "../fixtures/fusion";

let context: BrowserContext,
  page: Page,
  worker: Worker,
  profile: string,
  extensionId: string;
let reads = 0,
  writes = 0;
let catalogReads = 0,
  catalogFailure = false;
test.beforeAll(async () => {
  profile = await mkdtemp(resolve(tmpdir(), "kosmore-sale-family-"));
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
    if (path.startsWith("/api/")) {
      if (req.method() !== "GET") {
        writes++;
        return route.fulfill({ json: {} });
      }
      if (path === "/api/me") return route.fulfill({ json: me });
      if (path === "/api/atlas/families") {
        catalogReads++;
        if (catalogFailure) return route.fulfill({ status: 503, json: {} });
        const families = [
          ...new Map(
            Object.values(fusionMembership)
              .flat()
              .map((family) => [family.id, family]),
          ).values(),
        ];
        return route.fulfill({
          json: {
            domains: [
              ...familyCatalog.domains,
              { name: "Impact checks", families },
            ],
          },
        });
      }
      if (path === "/api/families")
        return route.fulfill({ json: familyMilestones });
      if (path === "/api/me/families")
        return route.fulfill({ json: myFamilies });
      if (path === "/api/market/listings/batch")
        return route.fulfill({
          json: {
            items: (url.searchParams.get("subjects") ?? "")
              .split(",")
              .filter((key) => saleFamilyKeys.includes(key))
              .map((key) => ({
                key,
                subjectId: key.split(".")[0],
                instanceId: "selected-copy",
                card: {},
                rarity: "Common",
                suggestion: { start: "12000000" },
              })),
          },
        });
      if (path.startsWith("/api/collection/")) {
        reads++;
        const id = path.split("/").at(-1)!;
        const detail = card(id);
        return route.fulfill({
          json: {
            ...detail,
            families: fusionMembership[id],
            copies:
              id === "304"
                ? [...detail.copies, { ...detail.copies[0], id: COPY_B }]
                : detail.copies,
          },
        });
      }
      if (path.endsWith("/prices")) return route.fulfill({ json: prices() });
      if (path === "/api/auctions" || path === "/api/me/auctions")
        return route.fulfill({ json: { items: [], nextOffset: null } });
      return route.fulfill({ status: 404, json: {} });
    }
    if (path.startsWith("/media/"))
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="#675381"/></svg>',
      });
    return route.fulfill({
      contentType: "text/html",
      body:
        path === "/market/sell"
          ? singleSellFixture(url.searchParams.get("subject") ?? "307")
          : saleFamilyFixture(path === "/market/sell/batch"),
    });
  });
  page = await context.newPage();
});
test.beforeEach(async () => {
  await page.goto("about:blank");
  reads = writes = 0;
  catalogReads = 0;
  catalogFailure = false;
  await worker.evaluate(async () => {
    await chrome.storage.session.clear();
    await chrome.storage.local.remove("kosmore.myListingPrices");
    await chrome.storage.local.set({
      "kosmore.settings": {
        schemaVersion: 1,
        enabled: false,
        cardOverlaysEnabled: false,
        salesOverlaysEnabled: false,
      },
    });
  });
});
test.afterAll(async () => {
  await context?.close();
  if (
    profile &&
    dirname(resolve(profile)) === resolve(tmpdir()) &&
    basename(profile).startsWith("kosmore-sale-family-")
  )
    await rm(profile, { recursive: true, force: true });
});

const pick = (key: string) => page.locator(`.mk-sell-grid [data-key="${key}"]`);
const row = (key: string) => page.locator(`.bsell-row[data-key="${key}"]`);

test("sale family impact updates before Continue, survives filters, and recalculates on draft removal", async () => {
  await page.goto("https://kosmora.io/market");
  await expect(pick("303").locator(".verdict")).toHaveText("✓ Safe");
  await pick("301").locator(".pick-hit").click();
  await pick("302").locator(".pick-hit").click();
  await expect(pick("303").locator(".verdict")).toHaveText("⚠ LosesAsteroidsI");
  await pick("303").locator(".pick-hit").click();
  await expect(pick("301").locator(".verdict")).toHaveText("⚠ LosesAsteroidsI");
  const before = reads;
  await pick("302").locator(".pick-hit").click();
  await expect(pick("301").locator(".verdict")).toHaveText("✓ Safe");
  await pick("302").locator(".pick-hit").click();
  await page.getByTestId("filter").click();
  await expect(pick("301").locator(".verdict")).toHaveText("⚠ LosesAsteroidsI");
  expect(reads).toBe(before);
  await page.getByTestId("sell-many-go").click();
  await expect(row("301").locator(".verdict")).toHaveText("⚠ LosesAsteroidsI");
  await expect(
    page.locator(".kc-article [data-kosmore-fusion-family]"),
  ).toHaveCount(0);
  await page.getByTestId("filter").click();
  await expect(row("301").locator(".verdict")).toHaveText("⚠ LosesAsteroidsI");
  await page.getByTestId("show-all").click();
  const draftReads = reads;
  await row("302").locator(".bsell-x").click();
  await expect(row("301").locator(".verdict")).toHaveText("✓ Safe");
  await expect(row("303").locator(".verdict")).toHaveText("✓ Safe");
  expect(reads).toBe(draftReads);
  await expect(row("301").locator("input")).toHaveValue("12.00");
  await row("301").getByTestId("bsell-copy").click();
  await expect(page.locator("body")).toHaveAttribute("data-copy-clicks", "1");
  await page.getByTestId("submit-sales").click();
  await expect(page.locator("body")).toHaveAttribute("data-submitted", "true");
  expect(writes).toBe(0);
});

test("sale family impact combines finishes and fits sale rows with price overlays on desktop and mobile", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as Record<string, unknown>;
    await chrome.storage.local.set({
      "kosmore.settings": {
        ...saved,
        salesOverlaysEnabled: true,
        showSalesMyLastListing: false,
      },
    });
  });
  await page.goto("https://kosmora.io/market/sell/batch?s=304,304.v,307");
  await expect(row("304").locator(".verdict")).toHaveText("⚠ LosesParrotsI");
  await expect(row("307").locator(".verdict")).toHaveText(
    "⚠ LosesMAMA AwardsI",
  );
  await expect(
    row("304").locator("[data-kosmore-sales-overlay]"),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const priceBox = (await row("304")
      .locator("[data-kosmore-sales-overlay]")
      .boundingBox())!;
    const impactBox = (await row("304").locator(".verdict").boundingBox())!;
    expect(impactBox.y).toBeGreaterThanOrEqual(priceBox.y + priceBox.height);
    expect(impactBox.x + impactBox.width).toBeLessThanOrEqual(width);
    const hostBox = (await row("304")
      .locator("[data-kosmore-fusion-family]")
      .boundingBox())!;
    expect(
      Math.abs(impactBox.x + impactBox.width - hostBox.x - hostBox.width),
    ).toBeLessThan(1);
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/sale-family-${width}.png`,
      fullPage: true,
    });
  }
  await row("304.v").locator(".bsell-x").click();
  await expect(row("304").locator(".verdict")).toHaveText("✓ Safe");
  await page.goto("https://kosmora.io/market/sell?subject=307");
  await expect(page.locator(".sell-form .verdict")).toHaveText(
    "⚠ LosesMAMA AwardsI",
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const impact = page.locator(".sell-form .verdict");
    const button = page.locator('.sell-form button[type="submit"]');
    const impactBox = (await impact.boundingBox())!,
      buttonBox = (await button.boundingBox())!;
    expect(impactBox.y + impactBox.height).toBeLessThanOrEqual(buttonBox.y);
    expect(
      Math.abs(
        impactBox.x + impactBox.width / 2 - buttonBox.x - buttonBox.width / 2,
      ),
    ).toBeLessThan(1);
    expect(
      await button.evaluate((el) =>
        el.previousElementSibling?.hasAttribute("data-kosmore-fusion-family"),
      ),
    ).toBe(true);
  }
  await expect(
    page.locator(".kc-article [data-kosmore-fusion-family]"),
  ).toHaveCount(0);
  await page.getByTestId("sell-start").fill("55");
  await expect(page.getByTestId("sell-start")).toHaveValue("55");
  await page.setViewportSize({ width: 1440, height: 1000 });
});

for (const width of [1440, 390])
  test(`sale family calculating badge stays gray and holds layout before Safe at ${width}px`, async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/collection/301", async (route) => {
      await waiting;
      await route.fallback();
    });
    try {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("https://kosmora.io/market/sell/batch?s=301");
      const badge = row("301").locator(".verdict");
      const host = row("301").locator("[data-kosmore-fusion-family]");
      await expect(badge).toHaveText("Calculating…");
      await expect(badge).toHaveClass("verdict pending");
      expect(
        await badge.evaluate((el) => getComputedStyle(el).borderColor),
      ).toBe("rgb(133, 137, 148)");
      const before = {
        row: await row("301").boundingBox(),
        host: await host.boundingBox(),
        input: await row("301").locator("input").boundingBox(),
        submit: await page.getByTestId("submit-sales").boundingBox(),
      };
      release();
      await expect(badge).toHaveText("✓ Safe");
      expect(await row("301").boundingBox()).toEqual(before.row);
      expect(await host.boundingBox()).toEqual(before.host);
      expect(await row("301").locator("input").boundingBox()).toEqual(
        before.input,
      );
      expect(await page.getByTestId("submit-sales").boundingBox()).toEqual(
        before.submit,
      );
      const bounds = (await badge.boundingBox())!;
      expect(
        Math.abs(bounds.x + bounds.width - before.host!.x - before.host!.width),
      ).toBeLessThan(1);
      await mkdir("test-results/screenshots", { recursive: true });
      await page.screenshot({
        path: `test-results/screenshots/sale-family-stable-${width}.png`,
        fullPage: true,
      });
    } finally {
      release();
      await page.unroute("**/api/collection/301");
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  });

for (const history of ["empty", "missing", "failed"] as const)
  test(`sale listing history stays quiet and hides the control when ${history}`, async () => {
    let lookedUp = 0;
    await page.route("**/api/me/auctions?**", (route) => {
      lookedUp++;
      return route.fulfill(
        history === "empty"
          ? { json: myListingPage([]) }
          : {
              status: history === "missing" ? 404 : 503,
              json: {
                code: history === "missing" ? "not_found" : "unavailable",
              },
            },
      );
    });
    await worker.evaluate(async () => {
      const saved = (await chrome.storage.local.get("kosmore.settings"))[
        "kosmore.settings"
      ] as object;
      await chrome.storage.local.set({
        "kosmore.settings": {
          ...saved,
          salesOverlaysEnabled: true,
          showSalesLastSale: false,
          showSalesLowestListing: false,
        },
      });
    });
    try {
      for (const path of [
        "/market/sell/batch?s=301",
        "/market/sell?subject=301",
      ]) {
        await page.goto("https://kosmora.io" + path);
        await expect.poll(() => lookedUp).toBeGreaterThan(0);
        const overlay = page.locator("[data-kosmore-sales-overlay]");
        await expect(overlay).toBeHidden();
        await expect(overlay.locator(".price-badge.history")).toHaveCount(0);
        await expect(overlay.locator(".status.error")).toHaveCount(0);
        await expect(page.locator("input").first()).toHaveValue("12.00");
      }
    } finally {
      await page.unroute("**/api/me/auctions?**");
    }
  });

test("sale family impact includes a restored batch that is filtered before content scripts load", async () => {
  await page.goto(
    "https://kosmora.io/market/sell/batch?s=301,302,303&filter=1",
  );
  await expect(page.locator(".bsell-row")).toHaveCount(1);
  await expect(row("301").locator(".verdict")).toHaveText("⚠ LosesAsteroidsI");
  await page.getByTestId("show-all").click();
  await row("302").locator(".bsell-x").click();
  await expect(row("301").locator(".verdict")).toHaveText("✓ Safe");
});

test("family blacklist uses friend-style tokens, defaults off, saves and cancels, and updates Safe badges live", async () => {
  await page.goto("https://kosmora.io/market/sell/batch?s=301,307");
  await expect(row("301").locator(".verdict")).toHaveText("✓ Safe");
  await expect(row("307").locator(".verdict")).toHaveText(
    "⚠ LosesMAMA AwardsI",
  );
  const before = reads;
  const options = await context.newPage();
  try {
    await options.goto(
      `chrome-extension://${extensionId}/options.html#family-impact-overlay`,
    );
    const group = options.locator("#family-impact-overlay");
    const enabled = group.getByLabel("Use Family Blacklist", { exact: true });
    const input = group.getByRole("combobox", {
      name: "Blacklisted Families",
      exact: true,
    });
    const save = group.getByRole("button", {
      name: "Save family impact settings",
      exact: true,
    });
    const cancel = group.getByRole("button", {
      name: "Cancel family impact settings changes",
      exact: true,
    });
    const tokens = group.getByRole("list", {
      name: "Blacklisted families",
      exact: true,
    });
    await expect(enabled).not.toBeChecked();
    await expect(input).toBeDisabled();
    expect(catalogReads).toBe(0);
    await enabled.check();
    await input.fill("Asteroids");
    await expect(
      group.getByRole("option", {
        name: "Asteroids · Impact checks",
        exact: true,
      }),
    ).toBeVisible();
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(tokens.locator("li")).toHaveCount(1);
    await input.fill("Invented family");
    await save.click();
    await expect(group.getByRole("alert")).toContainText(
      "Choose a valid family",
    );
    await expect(row("301").locator(".verdict")).toHaveText("✓ Safe");
    await cancel.click();
    await expect(enabled).not.toBeChecked();
    await expect(tokens.locator("li")).toHaveCount(0);
    await enabled.check();
    await input.fill("asteroids");
    await input.press("Enter");
    await input.fill("Ducks, Geese and Swans");
    await group.getByRole("button", { name: "Add", exact: true }).click();
    await expect(tokens.locator("li")).toHaveCount(2);
    await save.click();
    await expect(row("301").locator(".verdict")).toHaveText("Blacklist");
    await expect(row("301").locator(".verdict")).toHaveClass(
      "verdict drop blacklist",
    );
    await expect(row("307").locator(".verdict")).toHaveText(
      "⚠ LosesMAMA AwardsI",
    );
    expect(reads).toBe(before);
    await enabled.uncheck();
    await save.click();
    await expect(row("301").locator(".verdict")).toHaveText("✓ Safe");
    await options.reload();
    await expect(enabled).not.toBeChecked();
    await expect(tokens.locator("li")).toHaveCount(2);
    await enabled.check();
    await save.click();
    await expect(row("301").locator(".verdict")).toHaveText("Blacklist");
    await options.setViewportSize({ width: 390, height: 1000 });
    await input.fill("Fish");
    const add = (await group
      .getByRole("button", { name: "Add", exact: true })
      .boundingBox())!;
    const suggestions = (await group.getByRole("listbox").boundingBox())!;
    expect(add.x).toBeGreaterThanOrEqual(suggestions.x + suggestions.width);
    await group.getByRole("button", { name: "Add", exact: true }).click();
    await expect(tokens.locator("li")).toHaveCount(3);
    await group
      .getByRole("button", { name: "Remove family Fish", exact: true })
      .click();
    await expect(tokens.locator("li")).toHaveCount(2);
    await mkdir("test-results/screenshots", { recursive: true });
    await group.screenshot({
      path: "test-results/screenshots/family-blacklist-390.png",
    });
    expect(
      await options.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await group
      .getByRole("switch", {
        name: "Enable family impact overlays",
        exact: true,
      })
      .uncheck();
    await expect(enabled).toBeDisabled();
    await expect(input).toBeDisabled();
  } finally {
    await options.close();
  }
});

test("blacklist catalog failures preserve saved tokens and can be retried without extra impact reads", async () => {
  await worker.evaluate(async () => {
    const saved = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": { ...saved, familyBlacklist: ["Asteroids"] },
    });
  });
  await page.goto("https://kosmora.io/market/sell/batch?s=301");
  await expect(row("301").locator(".verdict")).toHaveText("✓ Safe");
  const before = reads;
  catalogFailure = true;
  const options = await context.newPage();
  try {
    await options.goto(
      `chrome-extension://${extensionId}/options.html#family-impact-overlay`,
    );
    const group = options.locator("#family-impact-overlay");
    await group.getByLabel("Use Family Blacklist", { exact: true }).check();
    await expect(group.getByText(/Family list unavailable:/)).toBeVisible();
    await expect(
      group
        .getByRole("list", { name: "Blacklisted families", exact: true })
        .locator("li"),
    ).toHaveCount(1);
    await group
      .getByRole("button", { name: "Save family impact settings", exact: true })
      .click();
    await expect(row("301").locator(".verdict")).toHaveText("Blacklist");
    catalogFailure = false;
    await group
      .getByRole("button", { name: "Retry families", exact: true })
      .click();
    const input = group.getByRole("combobox", {
      name: "Blacklisted Families",
      exact: true,
    });
    await input.fill("Parrots");
    await group
      .getByRole("option", { name: "Parrots · Impact checks", exact: true })
      .click();
    await expect(
      group
        .getByRole("list", { name: "Blacklisted families", exact: true })
        .locator("li"),
    ).toHaveCount(2);
    expect(reads).toBe(before);
  } finally {
    await options.close();
  }
});

test("family impact settings follow section order, preserve preferences and save only their group", async () => {
  const options = await context.newPage();
  try {
    await options.goto(
      `chrome-extension://${extensionId}/options.html#family-impact-overlay`,
    );
    const family = options.locator("#family-impact-overlay"),
      cards = options.locator("#card-overlays");
    expect(
      await family.evaluate((host) => [
        host.previousElementSibling?.id,
        host.nextElementSibling?.id,
      ]),
    ).toEqual(["card-overlays", "friend-tooltip"]);
    const links = await options.locator("nav a").allTextContents();
    expect(links.indexOf("Family Impact Overlay")).toBe(
      links.indexOf("Card Overlays") + 1,
    );
    const sale = family.getByLabel("Show on sale screens", { exact: true });
    await expect(sale).toBeChecked();
    await sale.uncheck();
    await family
      .getByRole("button", {
        name: "Cancel family impact settings changes",
        exact: true,
      })
      .click();
    await expect(sale).toBeChecked();
    await cards
      .getByRole("switch", { name: "Enable card overlays", exact: true })
      .check();
    await cards
      .getByLabel("Show quest icon on cards", { exact: true })
      .uncheck();
    await family
      .getByLabel("Show family impact on the Fusion page", { exact: true })
      .uncheck();
    await family
      .getByRole("button", { name: "Save family impact settings", exact: true })
      .click();
    await expect(family.getByRole("status")).toContainText("Saved.");
    expect(
      await worker.evaluate(
        async () =>
          (await chrome.storage.local.get("kosmore.settings"))[
            "kosmore.settings"
          ],
      ),
    ).toMatchObject({
      showFusionFamilyOverlay: false,
      showSalesFamilyOverlay: true,
      showQuestOverlay: true,
    });
    await family
      .getByRole("switch", {
        name: "Enable family impact overlays",
        exact: true,
      })
      .uncheck();
    await expect(sale).toBeDisabled();
    await options.reload();
    await expect(sale).toBeChecked();
    await expect(sale).toBeDisabled();
    await family
      .getByRole("switch", {
        name: "Enable family impact overlays",
        exact: true,
      })
      .check();
    await expect(
      family.getByLabel("Show family impact on the Fusion page", {
        exact: true,
      }),
    ).not.toBeChecked();
    await options.setViewportSize({ width: 390, height: 1000 });
    await family.screenshot({
      path: "test-results/screenshots/family-impact-settings-390.png",
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
