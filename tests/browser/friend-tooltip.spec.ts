import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename } from "node:path";
import { launchTestBrowser } from "./browser";
import { defaults } from "../../src/shared/settings";
import { card, face, friends, me, prices } from "../fixtures/data";
import { multiSelectFixture } from "../fixtures/multi-select";

let context: BrowserContext,
  worker: Worker,
  page: Page,
  profile: string,
  extensionId: string;
let account = "FixturePlayer",
  writes = 0,
  nativeClicks = 0,
  friendsFail = false;
const reminder = (notes: string, families: string[]) => ({
  schemaVersion: 1,
  notes,
  families,
});
const stored = () => ({
  "kosmore.settings": {
    ...defaults(),
    hoverDelayMs: 100,
    dismissDelayMs: 100,
    friendHoverDelayMs: 100,
    friendDismissDelayMs: 150,
    showOnSaleOverlay: false,
    showSaleHistoryOverlay: false,
    showActiveAuctionsOverlay: false,
    showQuestOverlay: false,
  },
  "kosmore.friend.fixtureplayer.batu": reminder(
    "Private astro note 🌌\nBring an extra card.",
    ["Astronomy", "Oceanography", "Arts, Crafts & Design"],
  ),
  "kosmore.friend.fixtureplayer.friendb": reminder("Friend B note", [
    "Space Exploration",
    "Film and Television Actors",
  ]),
  "kosmore.friend.fixtureplayer.nomatch": reminder(
    "Not associated with this card",
    ["Ancient History"],
  ),
  "kosmore.friend.fixtureplayer.ghost": reminder("No longer a current friend", [
    "Astronomy",
  ]),
  "kosmore.friend.otherplayer.batu": reminder("Other account note", [
    "Astronomy",
  ]),
});
function fixture() {
  return `<html><head><style>body{margin:0;padding:30px;background:#100b20;color:#fff;font:14px system-ui}main{display:flex;flex-direction:column;gap:250px}main>a{display:block;width:200px;color:white}.kc-article{position:relative;box-sizing:border-box;padding:8px;border:1px solid #9a7fc6;border-radius:10px;background:#21182f}.kc-img{width:180px;height:200px}.kc-name{font-size:16px}footer{font-size:10px}.ko-card{width:220px}</style></head><body><h1>Collection</h1><main>${["42", "43"].map((id) => `<a href="/card/${id}" onclick="event.preventDefault();window.recordCardOpen()">${face(id)}</a>`).join("")}</main></body></html>`;
}
const dialog = () => page.locator("#kosmore-friend-tooltip");
const trigger = () =>
  page.locator("#kosmore-root .header-signals .friend-trigger");
async function cardTooltip(id = "42") {
  await page.locator(`main>a[href="/card/${id}"] .kc-article`).hover();
  await expect(trigger()).toBeVisible();
}
async function open() {
  await cardTooltip();
  await trigger().hover();
  await expect(
    dialog().getByRole("button", { name: "batu", exact: true }),
  ).toBeVisible();
}
async function settings(update: Record<string, unknown>) {
  await worker.evaluate(async (patch) => {
    const current = (await chrome.storage.local.get("kosmore.settings"))[
      "kosmore.settings"
    ] as object;
    await chrome.storage.local.set({
      "kosmore.settings": { ...current, ...patch },
    });
  }, update);
}
test.beforeAll(async () => {
  profile = await mkdtemp(resolve(tmpdir(), "kosmore-friend-tooltip-"));
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
      if (path === "/api/friends" && friendsFail) {
        await route.fulfill({ status: 503, json: {} });
        return;
      }
      const id = path.split("/").at(-1)!;
      const detail =
        id === "43"
          ? {
              ...card(id),
              families: [{ id: "nature.oceanography", name: "Oceanography" }],
            }
          : card(id);
      const data =
        path === "/api/me"
          ? { ...me, handle: account }
          : path === "/api/friends"
            ? friends
            : path.startsWith("/api/collection/")
              ? detail
              : path.endsWith("/prices")
                ? prices(1)
                : path === "/api/auctions"
                  ? { items: [], nextOffset: null }
                  : path === "/api/albums"
                    ? { albums: [] }
                    : { subjects: [] };
      await route.fulfill({ json: data });
    } else if (path.startsWith("/media/"))
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="200"><rect width="180" height="200" fill="#49305f"/></svg>',
      });
    else if (path.startsWith("/u/") || path === "/social")
      await route.fulfill({
        contentType: "text/html",
        body: `<html><body><h1>${path === "/social" ? "Social" : "Profile"}</h1></body></html>`,
      });
    else await route.fulfill({ contentType: "text/html", body: fixture() });
  });
});
test.beforeEach(async () => {
  account = "FixturePlayer";
  writes = 0;
  nativeClicks = 0;
  friendsFail = false;
  await worker.evaluate(async (data) => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    await chrome.storage.local.set(data);
  }, stored());
  page = await context.newPage();
  await page.exposeFunction("recordCardOpen", () => {
    nativeClicks++;
  });
  await page.goto("https://kosmora.io/collection");
});
test.afterEach(async () => {
  expect(writes).toBe(0);
  expect(nativeClicks).toBe(0);
  await page.close();
});
test.afterAll(async () => {
  await context?.close();
  if (profile) {
    if (
      dirname(profile) !== resolve(tmpdir()) ||
      !basename(profile).startsWith("kosmore-friend-tooltip-")
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

test("overlay friend icons stay passive and only the hover tooltip opens friend details", async () => {
  const badge = page.locator(
    'main>a[href="/card/42"] [data-kosmore-card-overlays] .friend',
  );
  await expect(badge).toBeVisible();
  await expect(badge).not.toHaveAttribute("aria-haspopup");
  await expect(
    page.locator("[data-kosmore-card-overlays] .friend-trigger"),
  ).toHaveCount(0);
  const bounds = (await badge.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await expect(page.locator("#kosmore-root")).toBeVisible();
  await page.waitForTimeout(250);
  await expect(dialog()).toHaveCount(0);
  await trigger().hover();
  await expect(
    dialog().getByRole("button", { name: "batu", exact: true }),
  ).toBeVisible();
});

test("friend tooltip lists associated current friends and expands one complete set of saved details at a time", async () => {
  await open();
  await expect(page.locator("#kosmore-root")).toBeVisible();
  expect((await dialog().boundingBox())!.height).toBe(560);
  await expect(
    dialog()
      .getByRole("button", { name: "Pin friend tooltip", exact: true })
      .locator("svg"),
  ).toBeVisible();
  await expect(dialog().locator(".friend-name")).toHaveText([
    "batu",
    "FriendB",
  ]);
  await expect(dialog()).not.toContainText("No longer a current friend");
  await expect(
    dialog().getByRole("button", { name: "NoMatch", exact: true }),
  ).toHaveCount(0);
  await dialog().getByRole("button", { name: "batu", exact: true }).click();
  const details = dialog().getByRole("region", {
    name: "batu details",
    exact: true,
  });
  await expect(details.locator(".family-badge")).toHaveText([
    "Astronomy",
    "Oceanography",
    "Arts, Crafts & Design",
  ]);
  await expect(details.locator(".family-badge.matched")).toHaveText(
    "Astronomy",
  );
  await expect(details.locator(".notes")).toHaveText(
    "Private astro note 🌌\nBring an extra card.",
  );
  await expect(
    details.getByRole("link", { name: "Social", exact: true }),
  ).toHaveAttribute("href", "/social?f=batu");
  await expect(
    details.getByRole("link", { name: "Profile", exact: true }),
  ).toHaveAttribute("href", "/u/batu");
  await dialog().getByRole("button", { name: "FriendB", exact: true }).click();
  await expect(
    dialog().locator('.friend-summary[aria-expanded="true"]'),
  ).toHaveCount(1);
  await expect(
    dialog().locator('[data-friend="batu"] .friend-details'),
  ).toBeHidden();
  await expect(
    dialog()
      .getByRole("region", { name: "FriendB details", exact: true })
      .locator(".family-badge"),
  ).toHaveText(["Space Exploration", "Film and Television Actors"]);
  await dialog().getByRole("button", { name: "FriendB", exact: true }).click();
  await expect(
    dialog().locator('.friend-summary[aria-expanded="true"]'),
  ).toHaveCount(0);
  await dialog().getByRole("button", { name: "batu", exact: true }).click();
  await mkdir("test-results/screenshots", { recursive: true });
  await dialog().screenshot({
    path: "test-results/screenshots/friend-tooltip-expanded.png",
  });
});

test("Trade tab shares friend details and supports one expanded friend, keyboard toggles and live notes", async () => {
  await open();
  await dialog().getByRole("button", { name: "batu", exact: true }).click();
  const reference = await dialog()
    .getByRole("region", { name: "batu details", exact: true })
    .textContent();
  await dialog()
    .getByRole("button", { name: "Close friend tooltip", exact: true })
    .click();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("button", { name: "Pin popup", exact: true }).click();
  await popup.getByRole("tab", { name: "Trade", exact: true }).click();
  const list = popup.getByRole("list", {
    name: "Matching friends",
    exact: true,
  });
  await expect(list.locator(".friend-name")).toHaveText(["batu", "FriendB"]);
  await expect(
    list.locator('.friend-summary[aria-expanded="true"]'),
  ).toHaveCount(0);
  await list.getByRole("button", { name: "batu", exact: true }).click();
  const batu = list.getByRole("region", { name: "batu details", exact: true });
  expect(await batu.textContent()).toBe(reference);
  await expect(batu.locator(".family-badge.matched")).toHaveText("Astronomy");
  await list.getByRole("button", { name: "FriendB", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(batu).toBeHidden();
  await expect(
    list.locator('.friend-summary[aria-expanded="true"]'),
  ).toHaveCount(1);
  const friendB = list.getByRole("region", {
    name: "FriendB details",
    exact: true,
  });
  await expect(friendB.locator(".family-badge")).toHaveText([
    "Space Exploration",
    "Film and Television Actors",
  ]);
  await expect(friendB.locator(".notes")).toHaveText("Friend B note");
  await page.keyboard.press("Enter");
  await expect(
    list.locator('.friend-summary[aria-expanded="true"]'),
  ).toHaveCount(0);
  await list.getByRole("button", { name: "batu", exact: true }).click();
  await popup.getByRole("tab", { name: "Market", exact: true }).click();
  await popup.getByRole("tab", { name: "Trade", exact: true }).click();
  await expect(batu).toBeVisible();
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      "kosmore.friend.fixtureplayer.batu": {
        schemaVersion: 1,
        families: ["Astronomy", "Oceanography", "Arts, Crafts & Design"],
        notes: "Updated private notes\nBring two spare cards.",
      },
    });
  });
  await expect(batu.locator(".notes")).toHaveText(
    "Updated private notes\nBring two spare cards.",
  );
  await expect(
    list.locator('.friend-summary[aria-expanded="true"]'),
  ).toHaveCount(1);
  const profileLink = batu.getByRole("link", { name: "Profile", exact: true });
  await profileLink.scrollIntoViewIfNeeded();
  await expect(profileLink).toBeInViewport();
  await settings({ statBoxesEnabled: false, pinnedAlbumsEnabled: false });
  await mkdir("test-results/screenshots", { recursive: true });
  for (const width of [440, 320]) {
    await settings({ popupWidth: width });
    await expect
      .poll(async () => (await popup.boundingBox())?.width)
      .toBe(width);
    expect(
      await popup
        .locator(".tab-content")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await popup.locator(".tab-content").evaluate((el) => {
      el.scrollTop = 0;
    });
    await popup.locator(".tab-workspace").screenshot({
      path: `test-results/screenshots/trade-friend-details-${width}.png`,
    });
  }
});

test("Trade tab expands a single friend by default and works independently of the friend tooltip switch", async () => {
  await settings({ friendTooltipEnabled: false, cardOverlaysEnabled: false });
  await page.locator('main>a[href="/card/43"] .kc-article').hover();
  const popup = page.locator("#kosmore-root");
  await popup.getByRole("tab", { name: "Trade", exact: true }).click();
  const list = popup.getByRole("list", {
    name: "Matching friends",
    exact: true,
  });
  await expect(list.locator(".friend-name")).toHaveText(["batu"]);
  await expect(
    list.getByRole("button", { name: "batu", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  const details = list.getByRole("region", {
    name: "batu details",
    exact: true,
  });
  await expect(details.locator(".family-badge.matched")).toHaveText(
    "Oceanography",
  );
  await expect(details.locator(".notes")).toContainText("Private astro note");
  await expect(
    details.getByRole("link", { name: "Social", exact: true }),
  ).toHaveAttribute("href", "/social?f=batu");
  await expect(
    details.getByRole("link", { name: "Profile", exact: true }),
  ).toHaveAttribute("href", "/u/batu");
  await expect(dialog()).toHaveCount(0);
});

test("Trade tab friend actions navigate to the selected friend's Social and Profile pages", async () => {
  for (const action of ["Social", "Profile"]) {
    await cardTooltip();
    const popup = page.locator("#kosmore-root");
    await popup.getByRole("tab", { name: "Trade", exact: true }).click();
    await popup.getByRole("button", { name: "FriendB", exact: true }).click();
    await popup.getByRole("link", { name: action, exact: true }).press("Enter");
    await expect(page).toHaveURL(
      action === "Social"
        ? "https://kosmora.io/social?f=FriendB"
        : "https://kosmora.io/u/FriendB",
    );
    await page.goto("https://kosmora.io/collection");
  }
});

test("friend tooltip opens from the card tooltip and keeps its parent usable while moving into friend details", async () => {
  await page.locator('main>a[href="/card/42"] .kc-article').hover();
  const parent = page.locator("#kosmore-root"),
    icon = parent.locator(".header-signals .friend-trigger");
  await icon.hover();
  await expect(
    dialog().getByRole("button", { name: "batu", exact: true }),
  ).toBeVisible();
  await dialog().getByRole("button", { name: "batu", exact: true }).click();
  await page.waitForTimeout(250);
  await expect(parent).toBeVisible();
  await expect(dialog().locator(".notes")).toContainText("Private astro note");
  await dialog().screenshot({
    path: "test-results/screenshots/friend-tooltip-nested.png",
  });
  await page.keyboard.press("Escape");
  await expect(dialog()).toHaveCount(0);
  await expect(parent).toBeVisible();
  await icon.focus();
  await icon.press("Enter");
  await expect(
    dialog().getByRole("button", { name: "FriendB", exact: true }),
  ).toBeVisible();
  await dialog().getByRole("button", { name: "FriendB", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    dialog().getByRole("region", { name: "FriendB details", exact: true }),
  ).toBeVisible();
});

test("friend details navigate to Social with the friend selected and to the friend's Profile", async () => {
  for (const action of ["Social", "Profile"]) {
    await open();
    await dialog()
      .getByRole("button", { name: "FriendB", exact: true })
      .click();
    const link = dialog().getByRole("link", { name: action, exact: true });
    await link.focus();
    await link.press("Enter");
    await expect(page).toHaveURL(
      action === "Social"
        ? "https://kosmora.io/social?f=FriendB"
        : "https://kosmora.io/u/FriendB",
    );
    await page.goto("https://kosmora.io/collection");
  }
});

test("friend tooltip hover and dismissal use independent timings and cancel pending opens", async () => {
  await settings({ friendHoverDelayMs: 400, friendDismissDelayMs: 350 });
  await page.reload();
  await cardTooltip();
  await trigger().hover();
  await page.waitForTimeout(150);
  await expect(dialog()).toHaveCount(0);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(450);
  await expect(dialog()).toHaveCount(0);
  await open();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(150);
  await expect(dialog()).toBeVisible();
  await expect(dialog()).toHaveCount(0);
});

test("friend tooltip settings save independently, disable the popup, cancel edits, and stay usable on narrow screens", async () => {
  const options = await context.newPage();
  try {
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const group = options.locator("#friend-tooltip"),
      save = group.getByRole("button", {
        name: "Save",
        exact: true,
      });
    await options
      .getByRole("link", { name: "Friend Tooltip", exact: true })
      .click();
    await group.getByLabel("Friend hover delay", { exact: true }).fill("250");
    await group.getByLabel("Friend dismiss delay", { exact: true }).fill("800");
    await group.getByLabel("Friend tooltip width", { exact: true }).fill("280");
    await group
      .getByLabel("Friend tooltip height", { exact: true })
      .fill("220");
    await save.click();
    await expect(group.getByRole("status")).toContainText("Saved.");
    await open();
    await expect
      .poll(async () => (await dialog().boundingBox())!.width)
      .toBe(280);
    await group.getByLabel("Enable friend tooltip", { exact: true }).uncheck();
    await expect(
      group.getByLabel("Friend hover delay", { exact: true }),
    ).toBeDisabled();
    await expect(save).toBeDisabled();
    await expect(dialog()).toHaveCount(0);
    await expect(
      page.locator('main>a[href="/card/42"] .signal-badge.friend'),
    ).toBeVisible();
    await expect(trigger()).toHaveCount(0);
    await group.getByLabel("Enable friend tooltip", { exact: true }).check();
    await group
      .getByRole("button", {
        name: "Cancel",
        exact: true,
      })
      .click();
    await expect(
      group.getByLabel("Enable friend tooltip", { exact: true }),
    ).toBeChecked();
    await options.setViewportSize({ width: 390, height: 900 });
    await options
      .getByRole("link", { name: "Friend Tooltip", exact: true })
      .click();
    expect(
      await options.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await group.screenshot({
      path: "test-results/screenshots/friend-tooltip-settings-390.png",
    });
    const persisted = await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("kosmore.settings"))[
          "kosmore.settings"
        ] as Record<string, unknown>,
    );
    expect(persisted).toMatchObject({
      hoverDelayMs: 100,
      popupWidth: 440,
      friendHoverDelayMs: 250,
      friendDismissDelayMs: 800,
      friendTooltipWidth: 280,
      friendTooltipHeight: 220,
    });
    await page.setViewportSize({ width: 390, height: 700 });
    const parent = page.locator("#kosmore-root");
    if (await parent.isVisible())
      await parent
        .getByRole("button", { name: "Close KosMore popup", exact: true })
        .click();
    await page.mouse.move(5, 5);
    await open();
    await dialog().getByRole("button", { name: "batu", exact: true }).click();
    const bounds = (await dialog().boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(12);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(378);
    await dialog().screenshot({
      path: "test-results/screenshots/friend-tooltip-390.png",
    });
  } finally {
    await options.close();
  }
});

test("pinned friend tooltips drag and resize independently, update cards, and restore an empty shell across navigation", async () => {
  await open();
  await dialog()
    .getByRole("button", { name: "Pin friend tooltip", exact: true })
    .click();
  const initial = (await dialog().boundingBox())!,
    header = (await dialog().locator(".top h2").boundingBox())!;
  await page.mouse.move(header.x + 15, header.y + 8);
  await page.mouse.down();
  await page.mouse.move(header.x + 55, header.y + 38);
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await dialog().boundingBox())!.x))
    .toBe(Math.round(initial.x + 40));
  const edge = dialog().getByLabel("Resize friend tooltip e edge", {
    exact: true,
  });
  await edge.focus();
  await edge.press("ArrowRight");
  await expect
    .poll(async () => (await dialog().boundingBox())!.width)
    .toBe(330);
  await expect
    .poll(async () =>
      worker.evaluate(
        async () =>
          (await chrome.storage.local.get("kosmore.settings"))[
            "kosmore.settings"
          ] as { friendTooltipWidth: number },
      ),
    )
    .toMatchObject({ friendTooltipWidth: 330 });
  await cardTooltip("43");
  await trigger().hover();
  await expect(dialog().locator(".friend-name")).toHaveText(["batu"]);
  const onlyFriend = dialog().getByRole("button", {
    name: "batu",
    exact: true,
  });
  await expect(onlyFriend).toHaveAttribute("aria-expanded", "true");
  await expect(dialog().locator(".notes")).toContainText("Private astro note");
  await onlyFriend.click();
  await expect(onlyFriend).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(async () => Math.round((await dialog().boundingBox())!.x))
    .toBe(Math.round(initial.x + 40));
  await page.reload();
  await expect(dialog()).toContainText("Hover the friend icon");
  await expect(dialog()).not.toContainText("Private astro note");
  await expect(dialog()).toHaveAttribute("data-pinned", "");
  await dialog()
    .getByRole("button", { name: "Unpin friend tooltip", exact: true })
    .click();
  await expect(dialog()).toHaveCount(0);
});

test("friend tooltip refreshes saved details and discards them when the signed-in account changes", async () => {
  await open();
  await dialog()
    .getByRole("button", { name: "Pin friend tooltip", exact: true })
    .click();
  await dialog().getByRole("button", { name: "batu", exact: true }).click();
  await worker.evaluate(
    async (data) =>
      chrome.storage.local.set({ "kosmore.friend.fixtureplayer.batu": data }),
    reminder("Updated notes", ["Astronomy", "Extra family"]),
  );
  await expect(dialog().locator(".notes")).toHaveText("Updated notes");
  await expect(dialog().locator(".family-badge")).toHaveText([
    "Astronomy",
    "Extra family",
  ]);
  account = "OtherPlayer";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dialog()).not.toContainText("Updated notes");
  await expect(dialog()).toContainText("Hover the friend icon");
  await open();
  await dialog().getByRole("button", { name: "batu", exact: true }).click();
  await expect(dialog().locator(".notes")).toHaveText("Other account note");
  await expect(dialog()).not.toContainText("Private astro note");
});

test("late friend responses cannot reopen a popup for a removed card and refresh failures never expose old notes", async () => {
  await open();
  await dialog()
    .getByRole("button", { name: "Pin friend tooltip", exact: true })
    .click();
  await dialog().getByRole("button", { name: "batu", exact: true }).click();
  friendsFail = true;
  await dialog()
    .getByRole("button", { name: "Refresh friends", exact: true })
    .click();
  await expect(dialog().getByRole("status")).toContainText("503");
  await expect(dialog()).not.toContainText("Private astro note");
  friendsFail = false;
  await dialog()
    .getByRole("button", { name: "Refresh friends", exact: true })
    .click();
  await expect(
    dialog().getByRole("button", { name: "batu", exact: true }),
  ).toBeVisible();
  await dialog()
    .getByRole("button", { name: "Close friend tooltip", exact: true })
    .click();
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      started = resolve;
    });
  await page.route("**/api/me", async (route) => {
    started();
    await held;
    await route.fulfill({ json: me });
  });
  try {
    await trigger().click();
    await ready;
    await page
      .locator('main>a[href="/card/42"]')
      .evaluate((element) => element.remove());
    await expect(dialog()).toHaveCount(0);
    release();
    await page.waitForTimeout(100);
    await expect(dialog()).toHaveCount(0);
  } finally {
    release();
    await page.unroute("**/api/me");
  }
});

test("friend popup interactions in collection multi-select preserve native selection", async () => {
  await page.route("**/collection", (route) =>
    route.fulfill({ contentType: "text/html", body: multiSelectFixture() }),
  );
  await page.goto("https://kosmora.io/collection");
  const first = page.locator(".kc-article").first();
  await first.hover();
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.up();
  const picks = page.locator(".pick-hit");
  await expect(picks.first()).toHaveAttribute("aria-pressed", "true");
  const before = await picks.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-pressed")),
  );
  await picks.first().hover();
  await trigger().hover();
  await dialog().getByRole("button", { name: "batu", exact: true }).click();
  await expect(dialog().locator(".notes")).toContainText("Private astro note");
  expect(
    await picks.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-pressed")),
    ),
  ).toEqual(before);
});
