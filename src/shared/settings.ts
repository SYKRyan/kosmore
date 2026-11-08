import type { Settings } from "./types";
import { defaultStats, parseStats } from "./stat-catalog";
import { parseHotkeys } from "./hotkeys";
import { parsePopupPosition } from "./popup-layout";
import { validSaleAdjustment } from "./sales-prices";
export const SETTINGS_KEY = "kosmore.settings";
export const defaults = (): Settings => ({
  schemaVersion: 1,
  enabled: true,
  disableHoverTooltipInPulsar: false,
  useOverlayButtonInsteadOfHover: false,
  outsideClickClosesTooltipOnly: false,
  fullScreenCenteredOnOpen: false,
  profileRemindersEnabled: true,
  profileRemindersPinned: false,
  tradeRemindersEnabled: true,
  showTradeFamilyBadges: true,
  showTradePossibleInterest: true,
  tradeRaritySymbols: true,
  showTradeNotes: true,
  tradeNotesPinned: false,
  tradeNotesHoverDelayMs: 300,
  tradeNotesDismissDelayMs: 200,
  tradeNotesWidth: 320,
  tradeNotesHeight: 240,
  friendTooltipEnabled: true,
  friendHoverDelayMs: 300,
  friendDismissDelayMs: 200,
  friendTooltipWidth: 320,
  friendTooltipHeight: 560,
  friendTooltipPosition: null,
  navigationHotkeysEnabled: true,
  cardOverlaysEnabled: true,
  disableCardOverlaysInPulsar: false,
  salesOverlaysEnabled: true,
  showSalesLastSale: true,
  salesLastSaleSetsPrice: true,
  salesLastSaleAdjustment: 0,
  showSalesLowestListing: true,
  salesLowestListingSetsPrice: true,
  salesLowestListingAdjustment: 0,
  showSalesMyLastListing: true,
  salesMyLastListingSetsPrice: true,
  salesMyLastListingAdjustment: 0,
  statBoxesEnabled: true,
  pinnedAlbumsEnabled: true,
  closeTooltipWhenAddedToAlbum: false,
  applyCloseBehaviorToPinnedTooltips: false,
  hoverDelayMs: 300,
  dismissDelayMs: 200,
  popupWidth: 440,
  popupHeight: 900,
  popupPosition: null,
  showSaleHistoryOverlay: true,
  showLastSalePriceOverlay: true,
  showActiveAuctionsOverlay: true,
  showLowestListingPriceOverlay: true,
  showOnSaleOverlay: true,
  showFriendInterestOverlay: true,
  showQuestOverlay: true,
  showFusionFamilyOverlay: true,
  showTradeFamilyOverlay: true,
  showVortexFamilyOverlay: true,
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
  d.friendTooltipPosition = parsePopupPosition(v.friendTooltipPosition);
  if (typeof v.enabled === "boolean") d.enabled = v.enabled;
  for (const key of [
    "disableHoverTooltipInPulsar",
    "disableCardOverlaysInPulsar",
    "useOverlayButtonInsteadOfHover",
    "outsideClickClosesTooltipOnly",
    "fullScreenCenteredOnOpen",
    "profileRemindersEnabled",
    "profileRemindersPinned",
    "tradeRemindersEnabled",
    "showTradeFamilyBadges",
    "showTradePossibleInterest",
    "tradeRaritySymbols",
    "showTradeNotes",
    "tradeNotesPinned",
    "showTradeFamilyOverlay",
    "showVortexFamilyOverlay",
    "friendTooltipEnabled",
    "navigationHotkeysEnabled",
    "cardOverlaysEnabled",
    "salesOverlaysEnabled",
    "showSalesLastSale",
    "salesLastSaleSetsPrice",
    "showSalesLowestListing",
    "salesLowestListingSetsPrice",
    "showSalesMyLastListing",
    "salesMyLastListingSetsPrice",
    "statBoxesEnabled",
    "pinnedAlbumsEnabled",
  ] as const)
    if (typeof v[key] === "boolean") d[key] = v[key];
  for (const key of [
    "salesLastSaleAdjustment",
    "salesLowestListingAdjustment",
    "salesMyLastListingAdjustment",
  ] as const)
    if (validSaleAdjustment(v[key])) d[key] = v[key];
  if (typeof v.closeTooltipWhenAddedToAlbum === "boolean")
    d.closeTooltipWhenAddedToAlbum = v.closeTooltipWhenAddedToAlbum;
  if (typeof v.applyCloseBehaviorToPinnedTooltips === "boolean")
    d.applyCloseBehaviorToPinnedTooltips = v.applyCloseBehaviorToPinnedTooltips;
  if (typeof v.showSaleHistoryOverlay === "boolean")
    d.showSaleHistoryOverlay = v.showSaleHistoryOverlay;
  if (typeof v.showLastSalePriceOverlay === "boolean")
    d.showLastSalePriceOverlay = v.showLastSalePriceOverlay;
  if (typeof v.showActiveAuctionsOverlay === "boolean")
    d.showActiveAuctionsOverlay = v.showActiveAuctionsOverlay;
  if (typeof v.showLowestListingPriceOverlay === "boolean")
    d.showLowestListingPriceOverlay = v.showLowestListingPriceOverlay;
  if (typeof v.showOnSaleOverlay === "boolean")
    d.showOnSaleOverlay = v.showOnSaleOverlay;
  if (typeof v.showFriendInterestOverlay === "boolean")
    d.showFriendInterestOverlay = v.showFriendInterestOverlay;
  if (typeof v.showQuestOverlay === "boolean")
    d.showQuestOverlay = v.showQuestOverlay;
  if (typeof v.showFusionFamilyOverlay === "boolean")
    d.showFusionFamilyOverlay = v.showFusionFamilyOverlay;
  if (typeof v.hoverDelayMs === "number" && Number.isFinite(v.hoverDelayMs))
    d.hoverDelayMs = Math.min(2000, Math.max(100, Math.round(v.hoverDelayMs)));
  for (const [key, min, max] of [
    ["tradeNotesHoverDelayMs", 100, 2000],
    ["tradeNotesDismissDelayMs", 0, 30000],
    ["tradeNotesWidth", 240, 1200],
    ["tradeNotesHeight", 120, 1600],
    ["friendHoverDelayMs", 100, 2000],
    ["friendDismissDelayMs", 0, 30000],
    ["friendTooltipWidth", 240, 1200],
    ["friendTooltipHeight", 160, 1600],
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
        Object.defineProperty(d.pinnedAlbums, account, {
          enumerable: true,
          configurable: true,
          writable: true,
          value: [
            ...new Set(
              ids.filter(
                (id): id is string =>
                  typeof id === "string" &&
                  /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id),
              ),
            ),
          ].slice(0, 200),
        });
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
