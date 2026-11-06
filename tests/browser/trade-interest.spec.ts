import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchTestBrowser } from "./browser";
import { tradeFixture } from "../fixtures/trade";

let context: BrowserContext, page: Page, worker: Worker, profile: string;
let account = "FixturePlayer",
  writes = 0,
  requests = 0,
  fail = false,
  zero = false;
const summary = () => page.locator('[data-kosmore-trade="interest"]');
const badges = () => page.locator('[data-kosmore-trade="families"]');
const reminder = (families: string[]) => ({
  schemaVersion: 1,
  families,
  notes: "Private note",
});
const row = (id: string, rarity: string, quantity: number) => ({
  card: { subjectId: id, rarity },
  quantity: quantity + 10,
  available: quantity,
  usable: quantity,
});
test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), "kosmore-trade-interest-"));
  context = await launchTestBrowser(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1200, height: 850 },
    args: [
      `--disable-extensions-except=${join(process.cwd(), "dist")}`,
      `--load-extension=${join(process.cwd(), "dist")}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  await context.route("https://kosmora.io/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") writes++;
    if (!url.pathname.startsWith("/api/")) {
      await route.fulfill({ contentType: "text/html", body: tradeFixture() });
      return;
    }
    if (url.pathname === "/api/collection") {
      requests++;
      expect(url.searchParams.get("status")).toBe("available");
      expect(url.searchParams.get("sendable")).toBe("1");
      if (fail) {
        await route.fulfill({ status: 503, json: {} });
        return;
      }
      const next = url.searchParams.has("cursor"),
        films = url.searchParams.get("family") === "films";
      await route.fulfill({
        json: {
          items: zero
            ? []
            : [
                ...(next
                  ? [row("4", "Legendary", 3), row("5", "Mythic", 2)]
                  : films
                    ? [row("1", "Common", 50), row("3", "Rare", 20)]
                    : [row("1", "Common", 50), row("2", "Uncommon", 25)]),
                { ...row("8", "Epic", 10), usable: 0 },
                { ...row("9", "Epic", 10), available: 0, usable: 0 },
              ],
          nextCursor: !zero && films && !next ? "page2" : null,
        },
      });
      return;
    }
    await route.fulfill({
      json:
        url.pathname === "/api/me"
          ? { handle: account }
          : url.pathname === "/api/atlas/families"
            ? {
                domains: [
                  {
                    name: "Entertainment",
                    families: [
                      { id: "games", name: "Video Games" },
                      { id: "films", name: "Films" },
                    ],
                  },
                ],
              }
            : url.pathname === "/api/friends"
              ? { friends: [{ handle: "batu" }, { handle: "Other" }] }
              : { items: [], subjects: [] },
    });
  });
});
test.beforeEach(async () => {
  account = "FixturePlayer";
  writes = 0;
  requests = 0;
  fail = false;
  zero = false;
  await worker.evaluate(
    async (data) => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set(data);
    },
    {
      "kosmore.friend.fixtureplayer.batu": reminder(["Video Games", "Films"]),
      "kosmore.friend.fixtureplayer.other": reminder([]),
      "kosmore.friend.otherplayer.batu": reminder(["Films"]),
    },
  );
  page = await context.newPage();
  await page.goto("https://kosmora.io/trades/new");
});
test.afterEach(async () => {
  expect(writes).toBe(0);
  await page.close();
});
test.afterAll(async () => {
  await context?.close();
  if (profile)
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
});

async function open() {
  await page
    .getByRole("button", { name: "Trade with batu", exact: true })
    .click();
  await expect(badges().locator(".family-badge")).toHaveText([
    "Video Games",
    "Films",
  ]);
}
test("direct friend routes show families and counts despite native avatar initials", async () => {
  await page.goto("https://kosmora.io/trades/new?friend=batu");
  await expect(badges().locator(".family-badge")).toHaveText([
    "Video Games",
    "Films",
  ]);
  await expect(summary().locator('[data-rarity="Common"]')).toHaveText("× 50");
  await page
    .getByRole("button", { name: "Choose Northern Lights", exact: true })
    .click();
  await expect(badges().locator(".family-badge")).toHaveText([
    "Video Games",
    "Films",
  ]);
  await expect(summary().locator('[data-rarity="Rare"]')).toHaveText("× 20");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(badges()).toHaveCount(0);
  await page
    .getByRole("button", { name: "Trade with Other", exact: true })
    .click();
  await expect(badges()).toBeHidden();
  await expect(summary()).toBeHidden();
});
for (const [name, width, symbols] of [
  ["desktop", 1200, true],
  ["phone", 390, true],
  ["phone with rarity names", 390, false],
] as const) {
  test(`loading interest keeps the search stationary on both card steps at ${name} width`, async () => {
    await page.setViewportSize({ width, height: 900 });
    await worker.evaluate(
      (symbols) =>
        chrome.storage.local.set({
          "kosmore.settings": { schemaVersion: 1, tradeRaritySymbols: symbols },
        }),
      symbols,
    );
    for (const step of ["theirs", "mine"] as const) {
      let release!: () => void, started!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      await page.route("**/api/collection?**", async (route) => {
        started();
        await held;
        await route.fulfill({
          json: {
            items: [
              "Common",
              "Uncommon",
              "Rare",
              "Epic",
              "Legendary",
              "Mythic",
            ].map((rarity, i) => row(String(i + 1), rarity, 10000 + i)),
            nextCursor: null,
          },
        });
      });
      try {
        if (step === "theirs") await open();
        else {
          await page
            .getByRole("button", {
              name: "Choose Northern Lights",
              exact: true,
            })
            .click();
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        }
        await ready;
        await expect(summary().locator(".interest")).toHaveAttribute(
          "aria-busy",
          "true",
        );
        await expect(summary().locator(".label")).toContainText(
          "Possible Interest:",
        );
        await expect(summary().locator(".spinner")).toBeVisible();
        await expect(summary().locator(".rarity-count")).toHaveCount(0);
        const search = page.locator(
          `[data-testid="trade-${step === "theirs" ? "theirs" : "mine"}-filters"]`,
        );
        const before = (await search.boundingBox())!;
        const height = (await summary().boundingBox())!.height;
        await mkdir("test-results/screenshots", { recursive: true });
        if (step === "theirs" && symbols)
          await page.screenshot({
            path: `test-results/screenshots/trade-interest-loading-${width}.png`,
          });
        release();
        await expect(summary().locator(".interest")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        await expect(summary().locator(".rarity-count")).toHaveCount(6);
        await expect(summary().locator(".spinner")).toBeHidden();
        expect(
          Math.abs((await search.boundingBox())!.y - before.y),
        ).toBeLessThan(1);
        expect(
          Math.abs((await summary().boundingBox())!.height - height),
        ).toBeLessThan(1);
      } finally {
        release();
        await page.unroute("**/api/collection?**");
      }
    }
  });
}
test("shows badges below the native note and above complete deduplicated rarity totals", async () => {
  await expect(badges()).toHaveCount(0);
  await open();
  await expect(summary()).toBeVisible();
  await expect(summary().locator(".rarity-count").first()).toHaveAttribute(
    "aria-label",
    /./,
  );
  await expect(summary().locator(".rarity-count")).toHaveText([
    "× 50",
    "× 25",
    "× 20",
    "× 3",
    "× 2",
  ]);
  await expect(summary().locator("svg")).toHaveCount(5);
  await expect(summary().locator('[data-rarity="Epic"]')).toHaveCount(0);
  expect(
    await page
      .locator(".note")
      .evaluate((e) =>
        e.nextElementSibling?.getAttribute("data-kosmore-trade"),
      ),
  ).toBe("families");
  expect(
    await badges().evaluate((e) =>
      e.nextElementSibling?.getAttribute("data-kosmore-trade"),
    ),
  ).toBe("interest");
  expect(
    await page
      .locator('[data-testid="trade-theirs-filters"]')
      .evaluate((e) =>
        e.previousElementSibling?.getAttribute("data-kosmore-trade"),
      ),
  ).toBe("interest");
  expect(requests).toBe(3);
  await page.getByPlaceholder("Name, keyword or family").fill("Northern");
  await expect(summary().locator('[data-rarity="Common"]')).toHaveText("× 50");
  expect(requests).toBe(3);
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/trade-interest.png",
  });
  await page
    .getByRole("button", { name: "Choose Northern Lights", exact: true })
    .click();
  await expect(badges().locator(".family-badge")).toHaveCount(2);
  await expect(summary()).toBeVisible();
  await expect(summary().locator(".rarity-count")).toHaveText([
    "× 50",
    "× 25",
    "× 20",
    "× 3",
    "× 2",
  ]);
  expect(
    await page
      .locator(".sx-lockline")
      .evaluate((e) =>
        e.nextElementSibling?.getAttribute("data-kosmore-trade"),
      ),
  ).toBe("families");
  expect(
    await badges().evaluate((e) =>
      e.nextElementSibling?.getAttribute("data-kosmore-trade"),
    ),
  ).toBe("interest");
  expect(
    await page
      .locator('[data-testid="trade-mine-filters"]')
      .evaluate((e) =>
        e.previousElementSibling?.getAttribute("data-kosmore-trade"),
      ),
  ).toBe("interest");
  await page.getByPlaceholder("Search your cards").fill("Northern");
  await expect(summary().locator('[data-rarity="Common"]')).toHaveText("× 50");
  await page.screenshot({
    path: "test-results/screenshots/trade-interest-your-card.png",
  });
  expect(requests).toBe(3);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(summary()).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(summary()).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(summary()).toBeVisible();
  expect(requests).toBe(3);
});
test("hides zero totals and skips collection reads for a friend without families", async () => {
  zero = true;
  await open();
  await expect.poll(() => requests).toBe(2);
  await expect(summary()).toBeHidden();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", { name: "Trade with Other", exact: true })
    .click();
  await expect(badges()).toBeHidden();
  await expect(summary()).toBeHidden();
  expect(requests).toBe(2);
});
test("updates saved families and discards the previous account's counts", async () => {
  await open();
  await expect(summary()).toBeVisible();
  await worker.evaluate(
    (data) =>
      chrome.storage.local.set({ "kosmore.friend.fixtureplayer.batu": data }),
    reminder(["Films"]),
  );
  await expect(badges().locator(".family-badge")).toHaveText(["Films"]);
  await expect(summary().locator('[data-rarity="Uncommon"]')).toHaveCount(0);
  account = "OtherPlayer";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(badges().locator(".family-badge")).toHaveText(["Films"]);
  await expect(summary()).toBeVisible();
  await worker.evaluate(
    (data) =>
      chrome.storage.local.set({ "kosmore.friend.otherplayer.batu": data }),
    reminder([]),
  );
  await expect(badges()).toBeHidden();
  await expect(summary()).toBeHidden();
});
test("offers retry without partial totals after a failed page and respects extension disable", async () => {
  fail = true;
  await open();
  await expect(summary()).toContainText("Possible Interest unavailable.");
  await expect(summary().locator(".rarity-count")).toHaveCount(0);
  fail = false;
  await summary().getByRole("button", { name: "Retry", exact: true }).click();
  await expect(summary().locator('[data-rarity="Mythic"]')).toHaveText("× 2");
  await worker.evaluate(() =>
    chrome.storage.local.set({
      "kosmore.settings": { schemaVersion: 1, tradeRemindersEnabled: false },
    }),
  );
  await expect(badges()).toHaveCount(0);
  await expect(summary()).toHaveCount(0);
});
test("wraps the badges and native symbols on a narrow trade screen", async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open();
  await expect(summary()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/screenshots/trade-interest-390.png",
  });
  await page
    .getByRole("button", { name: "Choose Northern Lights", exact: true })
    .click();
  await expect(summary()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/screenshots/trade-interest-your-card-390.png",
  });
});

test("trade settings follow Profile, save independently, cancel drafts, and update the open trade", async () => {
  await open();
  await expect(summary()).toBeVisible();
  const options = await context.newPage();
  try {
    await options.goto(
      `chrome-extension://${new URL(worker.url()).host}/options.html#trade-reminders`,
    );
    const group = options.locator("#trade-reminders"),
      save = group.getByRole("button", {
        name: "Save trade reminder settings",
        exact: true,
      });
    expect(
      await options
        .locator("#profile-reminders")
        .evaluate((e) => e.nextElementSibling?.id),
    ).toBe("trade-reminders");
    await expect(
      group.getByRole("switch", { name: "Use rarity symbols", exact: true }),
    ).toBeChecked();
    expect(
      await group
        .getByLabel("Use rarity symbols", { exact: true })
        .evaluate((input) => {
          const row = input.closest(".settings-subsetting");
          return (
            !!row &&
            !!row.previousElementSibling?.querySelector(
              "#showTradePossibleInterest",
            )
          );
        }),
    ).toBe(true);
    await options.getByLabel("Tooltip width", { exact: true }).fill("720");
    await group
      .getByLabel("Show preferred family badges", { exact: true })
      .uncheck();
    await group.getByLabel("Use rarity symbols", { exact: true }).uncheck();
    await save.click();
    await expect(group.getByRole("status")).toContainText("Saved.");
    await expect(badges()).toBeHidden();
    await expect(summary().locator("svg")).toHaveCount(0);
    await expect(summary().locator('[data-rarity="Common"]')).toHaveText(
      "Common× 50",
    );
    const stored = await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ],
    );
    expect(stored).toMatchObject({
      popupWidth: 440,
      showTradeFamilyBadges: false,
      tradeRaritySymbols: false,
    });
    await group
      .getByLabel("Show possible interest counts", { exact: true })
      .uncheck();
    await expect(
      group.getByLabel("Use rarity symbols", { exact: true }),
    ).toBeDisabled();
    await group
      .getByRole("button", {
        name: "Cancel trade reminder settings changes",
        exact: true,
      })
      .click();
    await expect(
      group.getByLabel("Show possible interest counts", { exact: true }),
    ).toBeChecked();
    await group
      .getByRole("switch", { name: "Enable trade reminders", exact: true })
      .uncheck();
    await expect(
      group.getByLabel("Show preferred family badges", { exact: true }),
    ).toBeDisabled();
    await expect(save).toBeDisabled();
    await expect(
      group.getByRole("button", {
        name: "Cancel trade reminder settings changes",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(summary()).toHaveCount(0);
    await group
      .getByRole("switch", { name: "Enable trade reminders", exact: true })
      .check();
    await group
      .getByLabel("Show preferred family badges", { exact: true })
      .check();
    await group
      .getByLabel("Show possible interest counts", { exact: true })
      .uncheck();
    await save.click();
    await expect(badges()).toBeVisible();
    await expect(summary()).toHaveCount(0);
    const before = requests;
    await page.reload();
    await open();
    await expect(summary()).toHaveCount(0);
    expect(requests).toBe(before);
    await options.setViewportSize({ width: 390, height: 900 });
    await options
      .getByRole("link", { name: "Trade reminders", exact: true })
      .click();
    expect(
      await options.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await group.screenshot({
      path: "test-results/screenshots/trade-settings-390.png",
    });
  } finally {
    await options.close();
  }
});

test("ignores late collection results after changing to a player with no saved families", async () => {
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      started = resolve;
    });
  await page.route("**/api/collection?**", async (route) => {
    started();
    await held;
    await route.fulfill({
      json: { items: [row("1", "Mythic", 100)], nextCursor: null },
    });
  });
  try {
    await open();
    await ready;
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page
      .getByRole("button", { name: "Trade with Other", exact: true })
      .click();
    release();
    await expect(badges()).toBeHidden();
    await expect(summary()).toBeHidden();
    await expect(summary().locator(".rarity-count")).toHaveCount(0);
  } finally {
    release();
  }
});
