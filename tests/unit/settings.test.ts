import { it, expect } from "vitest";
import { parseSettings } from "../../src/shared/settings";
import { ALBUM_A, ALBUM_B } from "../fixtures/data";
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
it("handles unknown schemas and bounds the delay", () => {
  expect(parseSettings({ schemaVersion: 2 }).hoverDelayMs).toBe(300);
  expect(
    parseSettings({ schemaVersion: 1, hoverDelayMs: 0 }).hoverDelayMs,
  ).toBe(100);
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
  expect(s.showFriendInterestOverlay).toBe(true);
  expect(s.showQuestOverlay).toBe(true);
  expect(s.pinnedAlbums.alice).toEqual([ALBUM_A]);
});
it("keeps the indicator preferences independent of hover popups", () => {
  const s = parseSettings({
    schemaVersion: 1,
    enabled: false,
    showSaleHistoryOverlay: false,
    showFriendInterestOverlay: true,
    showQuestOverlay: false,
  });
  expect(s.enabled).toBe(false);
  expect(s.showSaleHistoryOverlay).toBe(false);
  expect(s.showFriendInterestOverlay).toBe(true);
  expect(s.showQuestOverlay).toBe(false);
});
