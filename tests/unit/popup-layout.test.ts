import { expect, it } from "vitest";
import {
  isPopupLayoutChange,
  parsePopupPosition,
  parsePopupState,
  resizedBounds,
} from "../../src/shared/popup-layout";
import { isRequest } from "../../src/shared/messages";
import { parseSettings } from "../../src/shared/settings";
it("validates stored positions, session pinning and layout messages", () => {
  expect(parsePopupPosition({ left: 420.4, top: 20.8 })).toEqual({
    left: 420,
    top: 21,
  });
  for (const value of [
    null,
    {},
    { left: NaN, top: 10 },
    { left: -1, top: 10 },
    { left: 100001, top: 10 },
  ])
    expect(parsePopupPosition(value)).toBeNull();
  expect(
    parsePopupState({ pinned: "true", position: { left: 20, top: 30 } }),
  ).toEqual({ pinned: false, position: { left: 20, top: 30 } });
  expect(parsePopupState({ tab: "notes" })).toEqual({
    pinned: false,
    position: null,
    tab: "notes",
  });
  expect(parsePopupState({ tab: "unknown" })).not.toHaveProperty("tab");
  for (const tab of ["market", "history", "trade", "notes"])
    expect(isPopupLayoutChange({ tab })).toBe(true);
  expect(
    isPopupLayoutChange({
      width: 500,
      height: 600,
      pinned: true,
      position: { left: 30, top: 40 },
    }),
  ).toBe(true);
  for (const change of [
    { width: Infinity },
    { height: 20 },
    { position: { left: 20 } },
    { tabId: 4 },
    { pinned: "true" },
    { tab: "unknown" },
    { tab: 1 },
  ])
    expect(isPopupLayoutChange(change)).toBe(false);
  expect(
    isRequest({ requestId: "a", op: "popupLayout", change: { pinned: false } }),
  ).toBe(true);
  expect(
    isRequest({ requestId: "a", op: "popupLayout", change: { width: "500" } }),
  ).toBe(false);
  expect(parseSettings({ schemaVersion: 1 }).popupPosition).toBeNull();
});
it("resizes all edges while keeping opposite edges anchored", () => {
  const start = { left: 400, top: 200, width: 500, height: 600 },
    viewport = { width: 1600, height: 1200 };
  for (const edge of ["n", "s", "e", "w", "ne", "se", "nw", "sw"]) {
    const next = resizedBounds(start, edge, 20, 30, viewport);
    expect(next.width).toBe(
      edge.includes("w") ? 480 : edge.includes("e") ? 520 : 500,
    );
    expect(next.height).toBe(
      edge.includes("n") ? 570 : edge.includes("s") ? 630 : 600,
    );
    if (edge.includes("w"))
      expect(next.left + next.width).toBe(start.left + start.width);
    if (edge.includes("n"))
      expect(next.top + next.height).toBe(start.top + start.height);
  }
});
it("bounds resizing to the screen and usable minimum dimensions", () => {
  const start = { left: 100, top: 100, width: 500, height: 600 },
    viewport = { width: 900, height: 900 };
  expect(resizedBounds(start, "se", -9999, -9999, viewport)).toEqual({
    ...start,
    width: 320,
    height: 480,
  });
  expect(resizedBounds(start, "nw", -9999, -9999, viewport)).toEqual({
    left: 12,
    top: 12,
    width: 588,
    height: 688,
  });
  expect(resizedBounds(start, "se", 9999, 9999, viewport)).toEqual({
    ...start,
    width: 788,
    height: 788,
  });
});
