import type { Settings } from "./types";
import { defaultStats, parseStats } from "./stat-catalog";
import { parseHotkeys } from "./hotkeys";
import { parsePopupPosition } from "./popup-layout";
export const SETTINGS_KEY = "kosmore.settings";
export const defaults = (): Settings => ({
  schemaVersion: 1,
  enabled: true,
  hoverDelayMs: 300,
  dismissDelayMs: 200,
  popupWidth: 440,
  popupHeight: 900,
  popupPosition: null,
  showSaleHistoryOverlay: true,
  showFriendInterestOverlay: true,
  showQuestOverlay: true,
  stats: defaultStats(),
  hotkeys: {},
  pinnedAlbums: {},
});
export function parseSettings(value: unknown): Settings {
  const d = defaults();
  if (!value || typeof value !== "object") return d;
  const v = value as Partial<Settings>;
  if (v.schemaVersion !== 1) return d;
  d.stats = parseStats(v.stats);
  d.hotkeys = parseHotkeys(v.hotkeys);
  d.popupPosition = parsePopupPosition(v.popupPosition);
  if (typeof v.enabled === "boolean") d.enabled = v.enabled;
  if (typeof v.showSaleHistoryOverlay === "boolean")
    d.showSaleHistoryOverlay = v.showSaleHistoryOverlay;
  if (typeof v.showFriendInterestOverlay === "boolean")
    d.showFriendInterestOverlay = v.showFriendInterestOverlay;
  if (typeof v.showQuestOverlay === "boolean")
    d.showQuestOverlay = v.showQuestOverlay;
  if (typeof v.hoverDelayMs === "number" && Number.isFinite(v.hoverDelayMs))
    d.hoverDelayMs = Math.min(2000, Math.max(100, Math.round(v.hoverDelayMs)));
  for (const [key, min, max] of [
    ["dismissDelayMs", 0, 30000],
    ["popupWidth", 320, 1200],
    ["popupHeight", 480, 1600],
  ] as const) {
    const value = v[key];
    if (typeof value === "number" && Number.isFinite(value))
      d[key] = Math.min(max, Math.max(min, Math.round(value)));
  }
  if (v.pinnedAlbums && typeof v.pinnedAlbums === "object")
    for (const [account, ids] of Object.entries(v.pinnedAlbums)) {
      if (/^[a-z0-9_]{1,24}$/.test(account) && Array.isArray(ids))
        d.pinnedAlbums[account] = [
          ...new Set(
            ids.filter(
              (id): id is string =>
                typeof id === "string" &&
                /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id),
            ),
          ),
        ].slice(0, 200);
    }
  return d;
}
export async function readSettings(): Promise<Settings> {
  return parseSettings(
    (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY],
  );
}
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: parseSettings(settings) });
}
