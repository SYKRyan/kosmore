import { expect, it } from "vitest";
import { defaults, parseSettings } from "../../src/shared/settings";
import {
  createBackup,
  parseBackup,
  serializeBackup,
  validateBackup,
} from "../../src/shared/backup";
import { isRequest } from "../../src/shared/messages";
import { resizedBounds } from "../../src/shared/popup-layout";

it("adds independent, smaller friend-tooltip defaults to existing settings and backups", () => {
  const previous = { ...defaults() } as Partial<ReturnType<typeof defaults>>;
  for (const key of [
    "friendTooltipEnabled",
    "friendHoverDelayMs",
    "friendDismissDelayMs",
    "friendTooltipWidth",
    "friendTooltipHeight",
    "friendTooltipPosition",
  ] as const)
    delete previous[key];
  const parsed = parseSettings(previous);
  expect(parsed).toMatchObject({
    friendTooltipEnabled: true,
    friendHoverDelayMs: 300,
    friendDismissDelayMs: 200,
    friendTooltipWidth: 320,
    friendTooltipHeight: 560,
    friendTooltipPosition: null,
  });
  const backup = createBackup(
    {
      "kosmore.friendPopup.7": {
        pinned: true,
        position: { left: 12, top: 20 },
      },
    },
    "1.0.0",
  );
  expect(serializeBackup(backup)).not.toContain("kosmore.friendPopup");
  Object.assign(backup.settings, {
    friendTooltipEnabled: false,
    friendHoverDelayMs: 750,
    friendDismissDelayMs: 1250,
    friendTooltipWidth: 280,
    friendTooltipHeight: 220,
    friendTooltipPosition: { left: 40, top: 55 },
  });
  expect(parseBackup(serializeBackup(backup)).settings).toEqual(
    backup.settings,
  );
});
it("bounds friend layout preferences and rejects invalid imported values", () => {
  expect(
    parseSettings({
      schemaVersion: 1,
      friendHoverDelayMs: -10,
      friendDismissDelayMs: 40000,
      friendTooltipWidth: 20,
      friendTooltipHeight: 9000,
    }),
  ).toMatchObject({
    friendHoverDelayMs: 100,
    friendDismissDelayMs: 30000,
    friendTooltipWidth: 240,
    friendTooltipHeight: 1600,
  });
  for (const change of [
    { friendHoverDelayMs: 99 },
    { friendDismissDelayMs: -1 },
    { friendTooltipWidth: 239 },
    { friendTooltipHeight: 159 },
    { friendTooltipPosition: { left: -1, top: 0 } },
  ]) {
    const backup = createBackup({}, "1.0.0");
    Object.assign(backup.settings, change);
    expect(() => validateBackup(backup)).toThrow();
  }
});
it("routes friend layouts independently with smaller dimension limits", () => {
  expect(isRequest({ op: "friendPopupState", requestId: "a" })).toBe(true);
  expect(
    isRequest({
      op: "friendPopupLayout",
      requestId: "a",
      change: {
        pinned: true,
        width: 240,
        height: 160,
        position: { left: 10, top: 20 },
      },
    }),
  ).toBe(true);
  expect(
    isRequest({
      op: "popupLayout",
      requestId: "a",
      change: { width: 240, height: 160 },
    }),
  ).toBe(false);
  for (const change of [
    { width: 239 },
    { height: 159 },
    { tabId: 7 },
    { accountKey: "other" },
    { width: "320" },
    { pinned: "true" },
  ])
    expect(isRequest({ op: "friendPopupLayout", requestId: "a", change })).toBe(
      false,
    );
  expect(
    resizedBounds(
      { left: 100, top: 100, width: 320, height: 360 },
      "se",
      -999,
      -999,
      { width: 900, height: 900 },
      { minWidth: 240, minHeight: 160 },
    ),
  ).toMatchObject({ width: 240, height: 160 });
});
