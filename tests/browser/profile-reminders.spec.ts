import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
  type Locator,
} from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename } from "node:path";
import { launchTestBrowser } from "./browser";
import { defaults } from "../../src/shared/settings";
import { me } from "../fixtures/data";
import { profileFixture } from "../fixtures/profile";
import { socialFixture } from "../fixtures/social";
import { familyCatalog } from "../fixtures/families";

let context: BrowserContext,
  worker: Worker,
  page: Page,
  profile: string,
  extensionId: string;
let account = "FixturePlayer",
  writes = 0,
  familiesFail = false;
const key = "kosmore.friend.fixtureplayer.batu";
const stored = () => ({
  "kosmore.settings": defaults(),
  [key]: {
    schemaVersion: 1,
    notes: "Bring a gift 🌌\nPrivate profile note",
    families: ["Ships and Boats", "Cinéma"],
  },
  "kosmore.friend.fixtureplayer.friendb": {
    schemaVersion: 1,
    notes: "Only Friend B",
    families: ["Fish"],
  },
  "kosmore.friend.otherplayer.batu": {
    schemaVersion: 1,
    notes: "Other account only",
    families: ["Pop Singers"],
  },
});
const editor = () => page.locator("#kosmore-profile-reminders");
const trigger = () =>
  page.locator("#kosmore-profile-trigger").getByRole("button");
async function checkAddPlacement(host: Locator) {
  const box = await host.locator(".token-editor").boundingBox();
  const add = await host
    .getByRole("button", { name: "Add", exact: true })
    .boundingBox();
  expect(add!.y).toBeGreaterThan(box!.y + box!.height);
  expect(Math.abs(add!.x + add!.width - box!.x - box!.width)).toBeLessThan(2);
  const footer = await host.locator(".footer").boundingBox();
  const status = await host.getByRole("status").boundingBox();
  const actions = await host.locator(".footer-actions").boundingBox();
  expect(Math.abs(status!.x - footer!.x)).toBeLessThan(2);
  expect(
    Math.abs(actions!.x + actions!.width - footer!.x - footer!.width),
  ).toBeLessThan(2);
}
async function open() {
  await trigger().click();
  await expect(editor().getByLabel("Notes", { exact: true })).toHaveValue(
    "Bring a gift 🌌\nPrivate profile note",
  );
}
test.beforeAll(async () => {
  profile = await mkdtemp(resolve(tmpdir(), "kosmore-profile-reminders-"));
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
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path.startsWith("/api/")) {
      if (route.request().method() !== "GET") writes++;
      if (path === "/api/atlas/families" && familiesFail) {
        await route.fulfill({ status: 503, json: {} });
        return;
      }
      await route.fulfill({
        json:
          path === "/api/me"
            ? { ...me, handle: account }
            : path === "/api/atlas/families"
              ? familyCatalog
              : {},
      });
    } else
      await route.fulfill({
        contentType: "text/html",
        body:
          path === "/social"
            ? socialFixture(account)
            : profileFixture(path.split("/").at(-1), account),
      });
  });
});
test.beforeEach(async () => {
  account = "FixturePlayer";
  writes = 0;
  familiesFail = false;
  await worker.evaluate(async (data) => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    await chrome.storage.local.set(data);
  }, stored());
  page = await context.newPage();
  await page.goto("https://kosmora.io/u/batu");
});
test.afterEach(async () => {
  expect(writes).toBe(0);
  await page.close();
});
test.afterAll(async () => {
  await context?.close();
  if (profile) {
    if (
      dirname(profile) !== resolve(tmpdir()) ||
      !basename(profile).startsWith("kosmore-profile-reminders-")
    )
      throw new Error("Unexpected test profile");
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});

test("profile badge sits below the header above Albums and opens the shared family and notes controls", async () => {
  await expect(trigger()).toBeVisible();
  await expect(page.locator(".pf-name")).toHaveText("batu");
  expect(
    await page
      .locator(".pf-banner")
      .locator("#kosmore-profile-trigger")
      .count(),
  ).toBe(0);
  expect(
    await page
      .locator("#kosmore-profile-trigger")
      .evaluate(
        (node) =>
          node.previousElementSibling?.classList.contains("pf-banner") &&
          node.nextElementSibling?.classList.contains("pf-albums"),
      ),
  ).toBe(true);
  await expect(editor()).toHaveCount(0);
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/profile-reminders-unpinned.png",
  });
  await open();
  await expect(editor()).toHaveAttribute("role", "dialog");
  await checkAddPlacement(editor());
  await expect(
    editor().getByRole("list", { name: "Preferred families" }),
  ).toContainText("Cinéma");
  await editor().getByLabel("Families they like", { exact: true }).fill("Fish");
  await editor().getByRole("option", { name: /Fish/ }).click();
  await editor()
    .getByLabel("Notes", { exact: true })
    .fill("Updated from profile 🐟");
  await editor()
    .getByRole("button", { name: "Save reminders", exact: true })
    .click();
  await expect(editor().getByRole("status")).toHaveText("Saved locally");
  const value = await worker.evaluate(
    async (key) => (await chrome.storage.local.get(key))[key],
    key,
  );
  expect(value).toMatchObject({
    notes: "Updated from profile 🐟",
    families: ["Ships and Boats", "Cinéma", "Fish"],
  });
  await page.goto("https://kosmora.io/social?f=batu");
  await page.locator("#kosmore-social-trigger").getByRole("button").click();
  const social = page.locator("#kosmore-friend-reminders");
  await expect(social.getByLabel("Notes", { exact: true })).toHaveValue(
    "Updated from profile 🐟",
  );
  await expect(
    social.getByRole("list", { name: "Preferred families" }),
  ).toContainText("Fish");
  await checkAddPlacement(social);
  await social.screenshot({
    path: "test-results/screenshots/social-reminders-add-button.png",
  });
});

test("pin moves the same unsaved editor above Albums, uses two columns, and persists across profiles", async () => {
  await open();
  await editor().getByLabel("Notes", { exact: true }).fill("Unsaved pin draft");
  await editor()
    .getByRole("button", { name: "Pin reminders to profile", exact: true })
    .click();
  await expect(editor()).toHaveAttribute("data-mode", "widget");
  await expect(page.locator("#kosmore-profile-trigger")).toBeHidden();
  await expect(editor().getByLabel("Notes", { exact: true })).toHaveValue(
    "Unsaved pin draft",
  );
  expect(
    await editor().evaluate((node) =>
      node.nextElementSibling?.classList.contains("pf-albums"),
    ),
  ).toBe(true);
  const widget = await editor().boundingBox(),
    brand = await editor().locator(".brand").boundingBox(),
    pin = await editor().locator(".profile-pin").boundingBox();
  expect(Math.abs(brand!.x - widget!.x - 24)).toBeLessThan(2);
  expect(
    Math.abs(pin!.x + pin!.width - widget!.x - widget!.width + 19),
  ).toBeLessThan(2);
  await expect(editor().locator("h2")).toHaveCount(0);
  expect(brand!.y).toBeLessThan(widget!.y + 50);
  expect(brand!.x + brand!.width).toBeLessThan(pin!.x);
  const families = await editor().locator(".families-section").boundingBox(),
    notes = await editor().locator(".notes-section").boundingBox();
  expect(notes!.x).toBeGreaterThan(families!.x + families!.width);
  expect(Math.abs(notes!.y - families!.y)).toBeLessThan(2);
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/profile-reminders-pinned.png",
  });
  await page.reload();
  await expect(editor()).toHaveAttribute("data-mode", "widget");
  await expect(editor().getByLabel("Notes", { exact: true })).toHaveValue(
    "Bring a gift 🌌\nPrivate profile note",
  );
  await page.goto("https://kosmora.io/u/FriendB");
  await expect(editor().getByLabel("Notes", { exact: true })).toHaveValue(
    "Only Friend B",
  );
  await expect(editor()).not.toContainText("batu");
  await editor()
    .getByRole("button", { name: "Unpin profile reminders", exact: true })
    .click();
  await expect(editor()).toHaveAttribute("data-mode", "popup");
  await expect(trigger()).toBeVisible();
  await expect(editor()).toBeVisible();
  await editor()
    .getByRole("button", { name: "Close profile reminders" })
    .click();
  await expect(editor()).toBeHidden();
});

test("Social launches below Collection/Profile and pins above Between You independently of Profile", async () => {
  await page.goto("https://kosmora.io/social?f=batu");
  const socialTrigger = page.locator("#kosmore-social-trigger");
  const socialEditor = page.locator("#kosmore-friend-reminders");
  await expect(socialTrigger).toBeVisible();
  expect(
    await socialTrigger.evaluate((node) => ({
      previous: node.previousElementSibling?.className,
      next: node.nextElementSibling?.textContent,
    })),
  ).toEqual({ previous: "sb-list sb-links", next: "Between you" });
  await expect(socialEditor).toHaveCount(0);
  await socialTrigger.getByRole("button").click();
  await expect(socialEditor).toHaveAttribute("role", "dialog");
  await socialEditor
    .getByLabel("Notes", { exact: true })
    .fill("Unsaved Social pin draft");
  await socialEditor
    .getByRole("button", { name: "Pin reminders to Social", exact: true })
    .click();
  await expect(socialEditor).toHaveAttribute("data-mode", "widget");
  await expect(socialTrigger).toBeHidden();
  await expect(socialEditor.getByLabel("Notes", { exact: true })).toHaveValue(
    "Unsaved Social pin draft",
  );
  expect(
    await socialEditor.evaluate((node) => node.nextElementSibling?.textContent),
  ).toBe("Between you");
  expect(
    await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ],
    ),
  ).toMatchObject({
    socialRemindersPinned: true,
    profileRemindersPinned: false,
  });
  await page.goto("https://kosmora.io/u/batu");
  await expect(trigger()).toBeVisible();
  await open();
  await editor()
    .getByRole("button", { name: "Pin reminders to profile", exact: true })
    .click();
  await page.goto("https://kosmora.io/social?f=batu");
  await expect(socialEditor).toHaveAttribute("data-mode", "widget");
  await socialEditor
    .getByRole("button", { name: "Unpin social reminders", exact: true })
    .click();
  await expect(socialEditor).toHaveAttribute("data-mode", "popup");
  await expect(socialTrigger).toBeVisible();
  expect(
    await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ],
    ),
  ).toMatchObject({
    socialRemindersPinned: false,
    profileRemindersPinned: true,
  });
  await socialEditor
    .getByRole("button", { name: "Pin reminders to Social", exact: true })
    .click();
  await page.goto("https://kosmora.io/u/batu");
  await expect(editor()).toHaveAttribute("data-mode", "widget");
  await editor()
    .getByRole("button", { name: "Unpin profile reminders", exact: true })
    .click();
  expect(
    await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ],
    ),
  ).toMatchObject({
    socialRemindersPinned: true,
    profileRemindersPinned: false,
  });
});

test("Social popup, mobile widget, and its own settings preserve shared reminders", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://kosmora.io/social?f=batu");
  const socialTrigger = page
    .locator("#kosmore-social-trigger")
    .getByRole("button");
  const socialEditor = page.locator("#kosmore-friend-reminders");
  await socialTrigger.focus();
  await socialTrigger.press("Enter");
  await expect(socialEditor.getByLabel("Notes", { exact: true })).toBeEnabled();
  await socialEditor
    .getByRole("button", { name: "Close social reminders", exact: true })
    .focus();
  await page.keyboard.press("Escape");
  await expect(socialEditor).toBeHidden();
  await expect(socialTrigger).toBeFocused();
  await socialTrigger.click();
  await page.locator(".sb-card-name").click();
  await expect(socialEditor).toBeHidden();
  await socialTrigger.click();
  await socialEditor
    .getByLabel("Notes", { exact: true })
    .fill("Mobile Social draft");
  await socialEditor
    .getByRole("button", { name: "Pin reminders to Social", exact: true })
    .click();
  await expect(socialEditor).toHaveAttribute("data-mode", "widget");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/social-reminders-pinned-390.png",
    fullPage: true,
  });
  const options = await context.newPage();
  try {
    await options.goto(
      `chrome-extension://${extensionId}/options.html#social-reminders`,
    );
    const section = options.locator("#social-reminders");
    const pin = section.getByLabel("Keep reminders pinned on Social", {
      exact: true,
    });
    await expect(pin).toBeChecked();
    await expect(
      options
        .locator("#profile-reminders")
        .getByLabel("Keep reminders pinned on profiles", { exact: true }),
    ).not.toBeChecked();
    await pin.uncheck();
    await section
      .getByRole("button", {
        name: "Cancel social reminder settings changes",
        exact: true,
      })
      .click();
    await expect(pin).toBeChecked();
    await pin.uncheck();
    await section
      .getByRole("button", {
        name: "Save social reminder settings",
        exact: true,
      })
      .click();
    await expect(socialTrigger).toBeVisible();
    await socialTrigger.click();
    await expect(socialEditor.getByLabel("Notes", { exact: true })).toHaveValue(
      "Mobile Social draft",
    );
    await section
      .getByRole("switch", { name: "Enable social reminders", exact: true })
      .uncheck();
    await expect(page.locator("#kosmore-social-trigger")).toHaveCount(0);
    await expect(socialEditor).toHaveCount(0);
    await expect(pin).toBeDisabled();
    await section
      .getByRole("switch", { name: "Enable social reminders", exact: true })
      .check();
    await expect(socialTrigger).toBeVisible();
    expect(
      await worker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        key,
      ),
    ).toMatchObject({ notes: "Bring a gift 🌌\nPrivate profile note" });
  } finally {
    await options.close();
  }
});

test("keyboard, popup dismissal and narrow profile layout stay usable", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger().focus();
  await trigger().press("Enter");
  await expect(editor().getByLabel("Notes", { exact: true })).toBeEnabled();
  await expect(
    editor().getByRole("button", { name: "Pin reminders to profile" }),
  ).toBeFocused();
  await page.screenshot({
    path: "test-results/screenshots/profile-reminders-popup-390.png",
  });
  await editor().getByLabel("Families they like", { exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(editor()).toBeVisible();
  await editor()
    .getByRole("button", { name: "Pin reminders to profile" })
    .focus();
  const box = await editor().boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.x + box!.width).toBeLessThanOrEqual(378);
  await page.keyboard.press("Escape");
  await expect(editor()).toBeHidden();
  await expect(trigger()).toBeFocused();
  await trigger().press("Enter");
  await editor()
    .getByRole("button", { name: "Pin reminders to profile" })
    .click();
  await expect(editor()).toHaveAttribute("data-mode", "widget");
  const families = await editor().locator(".families-section").boundingBox(),
    notes = await editor().locator(".notes-section").boundingBox();
  expect(notes!.y).toBeGreaterThan(families!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: "test-results/screenshots/profile-reminders-widget-390.png",
    fullPage: true,
  });
});

test("pinned notes follow the token box height as saved families grow and tokens are removed", async () => {
  await open();
  await editor()
    .getByRole("button", { name: "Pin reminders to profile", exact: true })
    .click();
  const families = [
    "Video Games",
    "Puzzle Video Games",
    "Racing Video Games",
    "Role-Playing Video Games",
    "Strategy Video Games",
    "Arcade Video Games",
    "Sports Video Games",
    "Fighting Games",
    "Massively Multiplayer Online Games",
    "Survival Horror Games",
  ];
  await worker.evaluate(
    async ({ key, families }) => {
      await chrome.storage.local.set({
        [key]: {
          schemaVersion: 1,
          notes: "A long note stays aligned with the family box.",
          families,
        },
      });
    },
    { key, families },
  );
  const tokenBox = editor().locator(".token-editor"),
    notes = editor().getByLabel("Notes", { exact: true });
  await expect(editor().locator(".token")).toHaveCount(families.length);
  const aligned = async () => {
    const box = (await tokenBox.boundingBox())!,
      area = (await notes.boundingBox())!;
    return Math.max(
      Math.abs(box.y - area.y),
      Math.abs(box.height - area.height),
    );
  };
  await expect.poll(aligned).toBeLessThan(2);
  const expanded = (await notes.boundingBox())!.height;
  await page.screenshot({
    path: "test-results/screenshots/profile-reminders-aligned-notes.png",
  });
  for (const family of families.slice(2))
    await editor()
      .getByRole("button", { name: `Remove family ${family}`, exact: true })
      .click();
  await expect.poll(aligned).toBeLessThan(2);
  expect((await notes.boundingBox())!.height).toBeLessThan(expanded);
  await checkAddPlacement(editor());
});

test("profile settings disable immediately without removing stored notes and can cancel edits", async () => {
  await open();
  const options = await context.newPage();
  try {
    await options.goto(
      `chrome-extension://${extensionId}/options.html#profile-reminders`,
    );
    const section = options.locator("#profile-reminders");
    await section
      .getByRole("switch", { name: "Enable profile reminders", exact: true })
      .uncheck();
    await expect(
      section.getByRole("button", {
        name: "Save profile reminder settings",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      section.getByRole("button", {
        name: "Cancel profile reminder settings changes",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(page.locator("#kosmore-profile-trigger")).toHaveCount(0);
    await expect(editor()).toHaveCount(0);
    expect(
      await worker.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        key,
      ),
    ).toMatchObject({ notes: "Bring a gift 🌌\nPrivate profile note" });
    await section.getByRole("switch").check();
    await expect(section.getByRole("status")).toContainText("Saved.");
    await expect(trigger()).toBeVisible();
    await open();
  } finally {
    await options.close();
  }
});

test("profile reminders stay in sync with Social and protect account boundaries", async () => {
  await open();
  const social = await context.newPage();
  try {
    await social.goto("https://kosmora.io/social?f=batu");
    await social.locator("#kosmore-social-trigger").getByRole("button").click();
    const controls = social.locator("#kosmore-friend-reminders");
    await controls
      .getByLabel("Notes", { exact: true })
      .fill("Shared from Social");
    await controls
      .getByRole("button", { name: "Save reminders", exact: true })
      .click();
    await expect(editor().getByLabel("Notes", { exact: true })).toHaveValue(
      "Shared from Social",
    );
    account = "OtherPlayer";
    await page.evaluate(() => {
      document.querySelector(".rail a")!.setAttribute("href", "/u/OtherPlayer");
    });
    await trigger().click();
    await expect(editor().getByLabel("Notes", { exact: true })).toHaveValue(
      "Other account only",
    );
    await expect(editor().locator(".tokens")).toContainText("Pop Singers");
  } finally {
    await social.close();
  }
});

test("family failures keep saved notes usable and stale profile markup does not bind to a different player", async () => {
  familiesFail = true;
  await open();
  await expect(editor().getByText(/Family list unavailable/)).toBeVisible();
  await editor().getByLabel("Notes", { exact: true }).fill("");
  await editor()
    .getByRole("button", { name: "Save reminders", exact: true })
    .click();
  await expect(editor().getByRole("status")).toHaveText("Saved locally");
  familiesFail = false;
  await editor()
    .getByRole("button", { name: "Retry families", exact: true })
    .click();
  await expect(
    editor().getByLabel("Families they like", { exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    history.pushState({}, "", "/u/FriendB");
    document.body.append(document.createElement("hr"));
  });
  await expect(editor()).toHaveCount(0);
  await expect(page.locator("#kosmore-profile-trigger")).toHaveCount(0);
  await page.evaluate(() => {
    document.querySelector(".pf-name")!.textContent = "FriendB";
  });
  await trigger().click();
  await expect(editor().getByLabel("Notes", { exact: true })).toHaveValue(
    "Only Friend B",
  );
});
