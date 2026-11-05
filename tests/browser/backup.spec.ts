import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { launchTestBrowser } from "./browser";
import {
  createBackup,
  serializeBackup,
  type StoredValues,
} from "../../src/shared/backup";
import { defaults, SETTINGS_KEY } from "../../src/shared/settings";
import { ALBUM_A, ALBUM_B, card, face, me, prices } from "../fixtures/data";
import { auctionPage } from "../fixtures/auctions";

let context: BrowserContext,
  worker: Worker,
  options: Page,
  extensionId: string,
  profile: string;
const note = (text: string) => ({ schemaVersion: 1, text });
const reminder = (
  notes: string,
  families = ["Film and Television Actors", "Arts, Crafts & Design"],
) => ({ schemaVersion: 1, notes, families });
function sourceValues(): StoredValues {
  return {
    [SETTINGS_KEY]: {
      ...defaults(),
      popupWidth: 560,
      popupPosition: { left: 120, top: 60 },
      showSaleHistoryOverlay: false,
      showActiveAuctionsOverlay: false,
      showOnSaleOverlay: false,
      showFriendInterestOverlay: false,
      showQuestOverlay: false,
      pinnedAlbums: {
        fixtureplayer: [ALBUM_B, ALBUM_A],
        otherplayer: [ALBUM_A],
      },
      hotkeys: {
        collection: {
          code: "KeyC",
          ctrl: false,
          alt: true,
          shift: false,
          meta: false,
        },
      },
      salesLastSaleAdjustment: -1.25,
      stats: [...defaults().stats].reverse(),
    },
    "kosmore.marketFinishes": ["veil"],
    "kosmore.friend.fixtureplayer.absentfriend": reminder(
      "Private gift ideas 🌌\nSecond line",
    ),
    "kosmore.friend.otherplayer.batu": reminder("Other account", []),
    "kosmore.cardNotes.fixtureplayer.42": note(
      "Northern lights 星\nSaved card note",
    ),
    "kosmore.cardNotes.otherplayer.99": note("Other account's card note"),
  };
}
async function launch() {
  const path = await mkdtemp(resolve(tmpdir(), "kosmore-backup-test-"));
  const browser = await launchTestBrowser(path, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${resolve("dist")}`,
      `--load-extension=${resolve("dist")}`,
    ],
  });
  const background =
    browser.serviceWorkers()[0] ??
    (await browser.waitForEvent("serviceworker"));
  return { path, browser, background, id: new URL(background.url()).host };
}
async function cleanup(path: string) {
  if (
    dirname(path) !== resolve(tmpdir()) ||
    !basename(path).startsWith("kosmore-backup-test-")
  )
    throw new Error("Unexpected test profile path");
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
async function snapshot(background = worker) {
  return background.evaluate(async () => chrome.storage.local.get(null));
}
async function choose(
  page: Page,
  contents = serializeBackup(createBackup(sourceValues(), "0.2.2")),
) {
  await page
    .getByLabel("Choose a backup JSON file", { exact: true })
    .setInputFiles({
      name: "KosMore-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(contents),
    });
  await expect(
    page.locator("#backup-restore").getByRole("status"),
  ).toContainText("Backup validated");
}
test.beforeAll(async () => {
  const launched = await launch();
  ({
    browser: context,
    background: worker,
    id: extensionId,
    path: profile,
  } = launched);
});
test.afterAll(async () => {
  await context?.close();
  if (profile) await cleanup(profile);
});
test.beforeEach(async () => {
  await worker.evaluate(async (data) => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    await chrome.storage.local.set(data);
  }, sourceValues());
  options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(
    options.getByRole("button", { name: "Export backup", exact: true }),
  ).toBeEnabled();
});
test.afterEach(async () => {
  await options?.close();
});

test("backup exports saved values and restores all accounts in a fresh browser without a game tab", async () => {
  let network = 0;
  const count = (request: import("@playwright/test").Request) => {
    if (request.url().startsWith("https://kosmora.io/")) network++;
  };
  context.on("request", count);
  // A draft is deliberately different from the saved backup.
  await options.getByLabel("Tooltip width", { exact: true }).fill("720");
  const downloading = options.waitForEvent("download");
  await options
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^KosMore-backup-\d{4}-\d{2}-\d{2}-\d{6}\.json$/,
  );
  const contents = await readFile((await download.path())!, "utf8"),
    exported = JSON.parse(contents);
  expect(exported.settings.popupWidth).toBe(560);
  expect(exported.friendReminders).toHaveLength(2);
  expect(exported.cardNotes).toHaveLength(2);
  expect(contents).toContain("Private gift ideas");
  const target = await launch();
  target.browser.on("request", count);
  try {
    await target.background.evaluate(async () => {
      await chrome.storage.local.set({ "unrelated.sentinel": "keep" });
      await chrome.storage.session.set({
        "kosmore.popup.888": { pinned: true },
      });
    });
    const destination = await target.browser.newPage();
    await destination.goto(`chrome-extension://${target.id}/options.html`);
    await choose(destination, contents);
    const backup = destination.locator("#backup-restore");
    await expect(backup.getByLabel("Import mode", { exact: true })).toHaveValue(
      "merge",
    );
    await expect(
      backup.getByRole("region", { name: "Backup preview" }),
    ).toContainText("fixtureplayer, otherplayer");
    await backup
      .getByRole("button", { name: "Import backup", exact: true })
      .click();
    await expect(backup.getByRole("status")).toContainText("Backup imported");
    const data = await snapshot(target.background);
    expect(data).toEqual({ ...sourceValues(), "unrelated.sentinel": "keep" });
    expect(
      await target.background.evaluate(
        async () =>
          (await chrome.storage.session.get("kosmore.popup.888"))[
            "kosmore.popup.888"
          ],
      ),
    ).toEqual({ pinned: true });
    await expect(
      destination.getByLabel("Tooltip width", { exact: true }),
    ).toHaveValue("560");
    await destination.reload();
    await expect(
      destination.getByLabel("Tooltip width", { exact: true }),
    ).toHaveValue("560");
    expect(network).toBe(0);
  } finally {
    context.off("request", count);
    await target.browser.close();
    await cleanup(target.path);
  }
});

test("backup merge retains destination-only notes while replace previews removals and requires confirmation", async () => {
  const existing = {
    ...sourceValues(),
    "kosmore.friend.fixtureplayer.absentfriend": reminder(
      "Destination version",
      ["Astronomy"],
    ),
    "kosmore.cardNotes.fixtureplayer.100": note("Destination only"),
    "kosmore.cardNotes.destination.200": note("Another account"),
    "unrelated.sentinel": "keep",
  };
  await worker.evaluate(
    async (data) => chrome.storage.local.set(data),
    existing,
  );
  const backup = options.locator("#backup-restore");
  await choose(options);
  await expect(backup.locator(".backup-impact")).toContainText("0 removed");
  await backup
    .getByRole("button", { name: "Import backup", exact: true })
    .click();
  await expect(backup.getByRole("status")).toContainText("Backup imported");
  expect((await snapshot())["kosmore.cardNotes.fixtureplayer.100"]).toEqual(
    note("Destination only"),
  );
  expect(
    (await snapshot())["kosmore.friend.fixtureplayer.absentfriend"],
  ).toEqual(sourceValues()["kosmore.friend.fixtureplayer.absentfriend"]);
  const before = await snapshot();
  await choose(options);
  await backup
    .getByLabel("Import mode", { exact: true })
    .selectOption("replace");
  await expect(backup.locator(".backup-impact")).toContainText("2 removed");
  await expect(
    backup.getByRole("button", { name: "Import backup", exact: true }),
  ).toBeDisabled();
  await backup
    .getByRole("button", { name: "Cancel import", exact: true })
    .click();
  expect(await snapshot()).toEqual(before);
  await choose(options);
  await backup
    .getByLabel("Import mode", { exact: true })
    .selectOption("replace");
  await backup
    .getByLabel(
      "Replace all saved KosMore settings and notes with this backup.",
      { exact: true },
    )
    .check();
  await backup
    .getByRole("button", { name: "Import backup", exact: true })
    .click();
  await expect(backup.getByRole("status")).toContainText("Backup imported");
  const after = await snapshot();
  expect(after["kosmore.cardNotes.fixtureplayer.100"]).toBeUndefined();
  expect(after["kosmore.cardNotes.destination.200"]).toBeUndefined();
  expect(after["unrelated.sentinel"]).toBe("keep");
});

test("backup preview and cancellation preserve unsaved settings, and invalid files never write", async () => {
  const before = await snapshot(),
    width = options.getByLabel("Tooltip width", { exact: true });
  const imported = createBackup(sourceValues(), "0.2.2");
  imported.settings.popupWidth = 620;
  await width.fill("720");
  const backup = options.locator("#backup-restore");
  await choose(options, serializeBackup(imported));
  await expect(
    backup.getByRole("button", { name: "Import backup", exact: true }),
  ).toBeDisabled();
  await expect(
    backup.getByText(/Save or cancel your unsaved settings/),
  ).toBeVisible();
  await backup
    .getByRole("button", { name: "Cancel import", exact: true })
    .click();
  await expect(width).toHaveValue("720");
  expect(await snapshot()).toEqual(before);
  await backup
    .getByLabel("Choose a backup JSON file", { exact: true })
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{bad}"),
    });
  await expect(backup.getByRole("status")).toContainText("not valid JSON");
  expect(await snapshot()).toEqual(before);
  await choose(options, serializeBackup(imported));
  await options
    .getByRole("button", {
      name: "Cancel tooltip settings changes",
      exact: true,
    })
    .click();
  await expect(
    backup.getByRole("button", { name: "Import backup", exact: true }),
  ).toBeEnabled();
  await backup
    .getByRole("button", { name: "Import backup", exact: true })
    .click();
  await expect(backup.getByRole("status")).toContainText("Backup imported");
  await expect(width).toHaveValue("620");
});

test("backup screen remains usable by keyboard on a narrow viewport", async () => {
  await options.setViewportSize({ width: 390, height: 900 });
  const nav = options.getByRole("navigation", { name: "Settings groups" });
  const link = nav.getByRole("link", { name: "Backup & restore", exact: true });
  await link.focus();
  await link.press("Enter");
  await choose(options);
  const backup = options.locator("#backup-restore"),
    mode = backup.getByLabel("Import mode", { exact: true });
  await mode.focus();
  await mode.selectOption("replace");
  const confirmation = backup.getByLabel(
    "Replace all saved KosMore settings and notes with this backup.",
    { exact: true },
  );
  await confirmation.focus();
  await confirmation.press("Space");
  await expect(confirmation).toBeChecked();
  await expect(
    backup.getByRole("button", { name: "Import backup", exact: true }),
  ).toBeEnabled();
  expect(
    await options.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir("test-results/screenshots", { recursive: true });
  await backup.screenshot({
    path: "test-results/screenshots/backup-restore-390.png",
  });
  await backup
    .getByRole("button", { name: "Cancel import", exact: true })
    .click();
});

test("backup imports update open game settings and notes while preserving a dirty card-note draft", async () => {
  let writes = 0;
  const game = await context.newPage();
  await game.route("https://kosmora.io/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      if (route.request().method() !== "GET") writes++;
      const data =
        url.pathname === "/api/me"
          ? me
          : url.pathname.startsWith("/api/collection/")
            ? card()
            : url.pathname.includes("/prices")
              ? prices(1)
              : url.pathname === "/api/auctions"
                ? auctionPage()
                : { albums: [] };
      await route.fulfill({ json: data });
    } else if (url.pathname.startsWith("/media/"))
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
      });
    else
      await route.fulfill({
        contentType: "text/html",
        body: `<html><body style="background:#171027;color:white"><main><a href="/card/42" style="display:block;width:200px">${face()}</a></main></body></html>`,
      });
  });
  try {
    await game.goto("https://kosmora.io/collection");
    await game.locator(".kc-article").hover();
    const popup = game.locator("#kosmore-root");
    await popup
      .getByRole("button", { name: "Pin popup", exact: true })
      .click();
    await popup.getByRole("tab", { name: "Notes", exact: true }).click();
    const input = popup.getByRole("textbox", {
      name: "Card notes",
      exact: true,
    });
    await expect(input).toHaveValue("Northern lights 星\nSaved card note");
    const imported = createBackup(sourceValues(), "0.2.2");
    imported.settings.popupWidth = 620;
    imported.cardNotes.find((row) => row.account === "fixtureplayer")!.value = {
      schemaVersion: 1,
      text: "Imported note",
    };
    await choose(options, serializeBackup(imported));
    const backup = options.locator("#backup-restore");
    await backup
      .getByRole("button", { name: "Import backup", exact: true })
      .click();
    await expect(backup.getByRole("status")).toContainText("Backup imported");
    await expect(input).toHaveValue("Imported note");
    await expect.poll(async () => (await popup.boundingBox())!.width).toBe(620);
    await input.fill("Keep this unsaved draft");
    imported.cardNotes.find(
      (row) => row.account === "fixtureplayer",
    )!.value.text = "New stored note";
    await choose(options, serializeBackup(imported));
    await backup
      .getByRole("button", { name: "Import backup", exact: true })
      .click();
    await expect(backup.getByRole("status")).toContainText("Backup imported");
    await expect(input).toHaveValue("Keep this unsaved draft");
    await expect(popup.locator(".notes-status")).toContainText(
      "Updated in another tab",
    );
    expect(writes).toBe(0);
  } finally {
    await game.close();
  }
});
