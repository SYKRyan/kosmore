import { afterEach, expect, it, vi } from "vitest";
import {
  STAT_CATALOG,
  defaultStats,
  parseStats,
  statSnapshot,
  visibleStats,
} from "../../src/shared/stat-catalog";
import {
  parseSettings,
  saveSettings,
  SETTINGS_KEY,
} from "../../src/shared/settings";
import { parseHistory, parseInsights } from "../../src/kosmora/contracts";
import { card, prices } from "../fixtures/data";
import { StatSettings } from "../../src/options/stat-settings";
import { statBox } from "../../src/content/stat-box";
import { signalBadges } from "../../src/content/signal-badges";
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("migrates older settings without resetting pins or the original six-stat order", () => {
  const settings = parseSettings({ schemaVersion: 1, pinnedAlbums: {} });
  expect(settings.stats.map((p) => p.id)).toEqual([
    "minPrice",
    "medianPrice",
    "maxPrice",
    "interest",
    "readership",
    "salesCount",
  ]);
  expect(settings.stats.every((p) => p.enabled)).toBe(true);
  expect(new Set(STAT_CATALOG.map((d) => d.id)).size).toBe(STAT_CATALOG.length);
});
it("preserves saved order and disabled stats, discards corrupt IDs and adds new catalog entries", () => {
  const saved = parseStats([
    { id: "readership", enabled: false },
    { id: "minPrice", enabled: true },
    { id: "readership", enabled: true },
    { id: "unknown", enabled: true },
    null,
  ]);
  expect(saved.slice(0, 2)).toEqual([
    { id: "readership", enabled: false },
    { id: "minPrice", enabled: true },
  ]);
  expect(saved).toHaveLength(STAT_CATALOG.length);
  expect(visibleStats(saved)[0].id).toBe("minPrice");
  expect(
    visibleStats(defaultStats().map((p) => ({ ...p, enabled: false }))),
  ).toEqual([]);
});
it("renders every definition through the same component and preserves partial history semantics", () => {
  const snapshot = statSnapshot(
    parseInsights(card()),
    {
      plain: parseHistory(
        { ...prices(1), prices: { ...prices(1).prices, count: 80 } },
        "plain",
      ),
      veil: new Error("unavailable"),
    },
    ["plain", "veil"],
  );
  const boxes = STAT_CATALOG.map((d) => statBox(d, d.read(snapshot)));
  expect(boxes.map((b) => b.querySelector("strong")!.textContent)).toEqual([
    "12",
    "18",
    "24",
    "18",
    "1,240",
    "80+",
  ]);
  expect(snapshot.priceNotice).toContain("unavailable");
  for (const [index, box] of boxes.entries())
    expect(box.dataset.statId).toBe(STAT_CATALOG[index].id);
  const empty = statSnapshot(undefined, {}, [], "Card request failed");
  expect(STAT_CATALOG.every((d) => d.read(empty).value === "—")).toBe(true);
  expect(STAT_CATALOG.find((d) => d.id === "interest")!.read(empty).title).toBe(
    "Card request failed",
  );
});
it("reorders and toggles the settings preview without persisting a draft until Save", async () => {
  let preferences = defaultStats();
  const set = vi.fn(async () => {});
  vi.stubGlobal("chrome", { storage: { local: { set } } });
  const view = new StatSettings((next) => {
    preferences = next;
    view.render(next);
  });
  document.body.append(view.host);
  view.render(preferences);
  (
    view.host.querySelector(
      '[aria-label="Move up Median Price stat"]',
    ) as HTMLButtonElement
  ).click();
  expect(preferences[0].id).toBe("medianPrice");
  const checkbox = view.host.querySelector(
    '[aria-label="Show Min Price"]',
  ) as HTMLInputElement;
  checkbox.click();
  expect(
    [...view.host.querySelectorAll(".metric")].map(
      (e) => (e as HTMLElement).dataset.statId,
    ),
  ).toEqual([
    "medianPrice",
    "maxPrice",
    "interest",
    "readership",
    "salesCount",
  ]);
  expect(set).not.toHaveBeenCalled();
  await saveSettings({ ...parseSettings(undefined), stats: preferences });
  expect(set).toHaveBeenCalledWith({
    [SETTINGS_KEY]: expect.objectContaining({ stats: preferences }),
  });
  view.render(defaultStats());
  expect(view.host.querySelectorAll(".metric")).toHaveLength(6);
});
it("uses the same enabled and positive-only indicator badges in popup headers and on cards", () => {
  const signals = { saleHistory: true, quest: true, interestedFriends: 2 };
  const settings = parseSettings(undefined);
  expect(
    signalBadges(signals, settings).map((e) => e.getAttribute("aria-label")),
  ).toEqual([
    "Completed sales in the last 30 days",
    "Part of a quest",
    "2 friends may be interested based on saved families",
  ]);
  expect(
    signalBadges(signals, { ...settings, showQuestOverlay: false }).map((e) =>
      e.classList.contains("quest"),
    ),
  ).not.toContain(true);
  expect(
    signalBadges(signals, {
      ...settings,
      showSaleHistoryOverlay: false,
      showQuestOverlay: false,
      showFriendInterestOverlay: false,
    }),
  ).toEqual([]);
  expect(
    signalBadges(
      { saleHistory: false, quest: false, interestedFriends: 0 },
      settings,
    ),
  ).toEqual([]);
});
