import { it, expect } from "vitest";
import { defaults, parseSettings } from "../../src/shared/settings";
import { settingsForPage } from "../../src/shared/page-settings";
import { ALBUM_A, ALBUM_B } from "../fixtures/data";
it("keeps Pulsar exclusions opt-in and applies each one only to games other than Vortex", () => {
  for (const key of [
    "disableHoverTooltipInPulsar",
    "disableCardOverlaysInPulsar",
  ] as const) {
    expect(parseSettings({ schemaVersion: 1 })[key]).toBe(false);
    expect(parseSettings({ schemaVersion: 1, [key]: "true" })[key]).toBe(false);
    expect(parseSettings({ schemaVersion: 1, [key]: true })[key]).toBe(true);
  }
  const settings = {
    ...defaults(),
    disableHoverTooltipInPulsar: true,
    disableCardOverlaysInPulsar: true,
  };
  for (const path of [
    "/constellation",
    "/aion",
    "/photon",
    "/horizon",
    "/umbra",
    "/constellation/challenge/123",
    "/aion/challenge/123",
    "/photon/",
    "/horizon/123",
    "/umbra/123",
  ]) {
    expect(settingsForPage(settings, path)).toMatchObject({
      enabled: false,
      cardOverlaysEnabled: false,
    });
    expect(
      settingsForPage(
        { ...settings, disableHoverTooltipInPulsar: false },
        path,
      ),
    ).toMatchObject({ enabled: true, cardOverlaysEnabled: false });
    expect(
      settingsForPage(
        { ...settings, disableCardOverlaysInPulsar: false },
        path,
      ),
    ).toMatchObject({ enabled: false, cardOverlaysEnabled: true });
    expect(settingsForPage(defaults(), path)).toMatchObject({
      enabled: true,
      cardOverlaysEnabled: true,
    });
  }
  for (const path of [
    "/collection",
    "/fusion",
    "/games",
    "/games/",
    "/vortex",
    "/vortex/",
    "/vortex/inventory",
    "/constellation-extra",
    "/games-extra",
    "/card/42",
  ]) {
    expect(settingsForPage(settings, path)).toBe(settings);
  }
  expect(settings).toMatchObject({ enabled: true, cardOverlaysEnabled: true });
  expect(
    settingsForPage(
      { ...defaults(), enabled: false, cardOverlaysEnabled: false },
      "/aion",
    ),
  ).toMatchObject({ enabled: false, cardOverlaysEnabled: false });
});
it("keeps account pins isolated and ordered while discarding corrupt identifiers", () => {
  const s = parseSettings({
    schemaVersion: 1,
    enabled: false,
    hoverDelayMs: 350,
    pinnedAlbums: { alice: [ALBUM_B, ALBUM_A, ALBUM_B, "bad"], bob: [ALBUM_A] },
  });
  expect(s.pinnedAlbums.alice).toEqual([ALBUM_B, ALBUM_A]);
  expect(s.pinnedAlbums.bob).toEqual([ALBUM_A]);
  expect(s.enabled).toBe(false);
});
it("enables new feature groups for older settings and keeps configuration when groups are disabled", () => {
  const keys = [
    "navigationHotkeysEnabled",
    "tradeRemindersEnabled",
    "showTradeFamilyBadges",
    "showTradePossibleInterest",
    "tradeRaritySymbols",
    "showTradeNotes",
    "showTradeFamilyOverlay",
    "showVortexFamilyOverlay",
    "cardOverlaysEnabled",
    "statBoxesEnabled",
    "pinnedAlbumsEnabled",
  ] as const;
  const previous = {
    schemaVersion: 1,
    pinnedAlbums: { alice: [ALBUM_A] },
    stats: [{ id: "minPrice", enabled: false }],
    hotkeys: {
      home: { code: "KeyH", alt: true, ctrl: false, shift: false, meta: false },
    },
  };
  for (const key of keys) {
    expect(parseSettings(previous)[key]).toBe(true);
    expect(parseSettings({ ...previous, [key]: "false" })[key]).toBe(true);
    const disabled = parseSettings({ ...previous, [key]: false });
    expect(disabled[key]).toBe(false);
    expect(disabled.pinnedAlbums.alice).toEqual([ALBUM_A]);
    expect(disabled.stats[0]).toEqual({ id: "minPrice", enabled: false });
    expect(disabled.hotkeys.home?.code).toBe("KeyH");
  }
});
it("bounds trade notes sizes and delays and preserves the pin preference", () => {
  const old = parseSettings({ schemaVersion: 1 });
  expect([
    old.tradeNotesPinned,
    old.tradeNotesWidth,
    old.tradeNotesHeight,
  ]).toEqual([false, 320, 240]);
  const small = parseSettings({
    schemaVersion: 1,
    tradeNotesWidth: 1,
    tradeNotesHeight: 1,
    tradeNotesHoverDelayMs: 1,
    tradeNotesDismissDelayMs: -1,
    tradeNotesPinned: true,
  });
  expect([
    small.tradeNotesWidth,
    small.tradeNotesHeight,
    small.tradeNotesHoverDelayMs,
    small.tradeNotesDismissDelayMs,
    small.tradeNotesPinned,
  ]).toEqual([240, 120, 100, 0, true]);
  const large = parseSettings({
    schemaVersion: 1,
    tradeNotesWidth: 99999,
    tradeNotesHeight: 99999,
    tradeNotesHoverDelayMs: 99999,
    tradeNotesDismissDelayMs: 99999,
  });
  expect([
    large.tradeNotesWidth,
    large.tradeNotesHeight,
    large.tradeNotesHoverDelayMs,
    large.tradeNotesDismissDelayMs,
  ]).toEqual([1200, 1600, 2000, 30000]);
});
it("handles unknown schemas and bounds the delay", () => {
  expect(parseSettings({ schemaVersion: 2 }).hoverDelayMs).toBe(300);
  expect(
    parseSettings({ schemaVersion: 1, hoverDelayMs: 0 }).hoverDelayMs,
  ).toBe(100);
});
it("keeps the tooltip overlay button opt-in for new and old settings", () => {
  expect(parseSettings(undefined).useOverlayButtonInsteadOfHover).toBe(false);
  expect(
    parseSettings({ schemaVersion: 1 }).useOverlayButtonInsteadOfHover,
  ).toBe(false);
  for (const value of [true, false, "true", 1, null])
    expect(
      parseSettings({ schemaVersion: 1, useOverlayButtonInsteadOfHover: value })
        .useOverlayButtonInsteadOfHover,
    ).toBe(value === true);
});
it("keeps consuming outside tooltip clicks off by default and accepts only booleans", () => {
  expect(parseSettings(undefined).outsideClickClosesTooltipOnly).toBe(false);
  expect(
    parseSettings({ schemaVersion: 1 }).outsideClickClosesTooltipOnly,
  ).toBe(false);
  for (const value of [true, false, "true", 1, null])
    expect(
      parseSettings({ schemaVersion: 1, outsideClickClosesTooltipOnly: value })
        .outsideClickClosesTooltipOnly,
    ).toBe(value === true);
});
it("keeps full-screen centered tooltips opt-in for old and new settings", () => {
  expect(parseSettings(undefined).fullScreenCenteredOnOpen).toBe(false);
  expect(parseSettings({ schemaVersion: 1 }).fullScreenCenteredOnOpen).toBe(
    false,
  );
  for (const value of [true, false, "true", 1, null])
    expect(
      parseSettings({ schemaVersion: 1, fullScreenCenteredOnOpen: value })
        .fullScreenCenteredOnOpen,
    ).toBe(value === true);
});
it("defaults overlay prices on and preserves independent price choices when their parent icons are disabled", () => {
  for (const key of [
    "showLastSalePriceOverlay",
    "showLowestListingPriceOverlay",
  ] as const) {
    expect(parseSettings({ schemaVersion: 1 })[key]).toBe(true);
    expect(parseSettings({ schemaVersion: 1, [key]: "false" })[key]).toBe(true);
    expect(parseSettings({ schemaVersion: 1, [key]: false })[key]).toBe(false);
  }
  const saved = parseSettings({
    schemaVersion: 1,
    showSaleHistoryOverlay: false,
    showActiveAuctionsOverlay: false,
  });
  expect(saved.showLastSalePriceOverlay).toBe(true);
  expect(saved.showLowestListingPriceOverlay).toBe(true);
});
it("defaults closing after album additions off and accepts only saved boolean preferences", () => {
  expect(parseSettings(undefined).closeTooltipWhenAddedToAlbum).toBe(false);
  expect(parseSettings({ schemaVersion: 1 }).closeTooltipWhenAddedToAlbum).toBe(
    false,
  );
  for (const value of [true, false, "true", 1, null])
    expect(
      parseSettings({ schemaVersion: 1, closeTooltipWhenAddedToAlbum: value })
        .closeTooltipWhenAddedToAlbum,
    ).toBe(value === true);
});
it("defaults pinned tooltips out of album close behavior and preserves the independent saved subsetting", () => {
  expect(parseSettings(undefined).applyCloseBehaviorToPinnedTooltips).toBe(
    false,
  );
  expect(
    parseSettings({ schemaVersion: 1, closeTooltipWhenAddedToAlbum: true })
      .applyCloseBehaviorToPinnedTooltips,
  ).toBe(false);
  for (const value of [true, false, "true", 1, null]) {
    const parsed = parseSettings({
      schemaVersion: 1,
      closeTooltipWhenAddedToAlbum: false,
      applyCloseBehaviorToPinnedTooltips: value,
    });
    expect(parsed.applyCloseBehaviorToPinnedTooltips).toBe(value === true);
    expect(parsed.closeTooltipWhenAddedToAlbum).toBe(false);
  }
});
it("adds popup preferences to old settings and bounds finite values", () => {
  const old = parseSettings({ schemaVersion: 1 });
  expect([old.popupWidth, old.popupHeight, old.dismissDelayMs]).toEqual([
    440, 900, 200,
  ]);
  const small = parseSettings({
    schemaVersion: 1,
    popupWidth: 10,
    popupHeight: 10,
    dismissDelayMs: -1,
  });
  expect([small.popupWidth, small.popupHeight, small.dismissDelayMs]).toEqual([
    320, 480, 0,
  ]);
  const large = parseSettings({
    schemaVersion: 1,
    popupWidth: 9999,
    popupHeight: 9999,
    dismissDelayMs: 99999,
  });
  expect([large.popupWidth, large.popupHeight, large.dismissDelayMs]).toEqual([
    1200, 1600, 30000,
  ]);
  const corrupt = parseSettings({
    schemaVersion: 1,
    popupWidth: NaN,
    popupHeight: Infinity,
    dismissDelayMs: "500",
  });
  expect([
    corrupt.popupWidth,
    corrupt.popupHeight,
    corrupt.dismissDelayMs,
  ]).toEqual([440, 900, 200]);
  expect(
    parseSettings({ schemaVersion: 1, dismissDelayMs: 450.6 }).dismissDelayMs,
  ).toBe(451);
});
it("enables new indicators for older settings without changing pins", () => {
  const s = parseSettings({
    schemaVersion: 1,
    pinnedAlbums: { alice: [ALBUM_A] },
  });
  expect(s.showSaleHistoryOverlay).toBe(true);
  expect(s.showActiveAuctionsOverlay).toBe(true);
  expect(s.showOnSaleOverlay).toBe(true);
  expect(s.showFriendInterestOverlay).toBe(true);
  expect(s.showQuestOverlay).toBe(true);
  expect(s.pinnedAlbums.alice).toEqual([ALBUM_A]);
});
it("keeps the indicator preferences independent of hover popups", () => {
  const s = parseSettings({
    schemaVersion: 1,
    enabled: false,
    showSaleHistoryOverlay: false,
    showActiveAuctionsOverlay: false,
    showOnSaleOverlay: false,
    showFriendInterestOverlay: true,
    showQuestOverlay: false,
  });
  expect(s.enabled).toBe(false);
  expect(s.showSaleHistoryOverlay).toBe(false);
  expect(s.showActiveAuctionsOverlay).toBe(false);
  expect(s.showOnSaleOverlay).toBe(false);
  expect(s.showFriendInterestOverlay).toBe(true);
  expect(s.showQuestOverlay).toBe(false);
});
