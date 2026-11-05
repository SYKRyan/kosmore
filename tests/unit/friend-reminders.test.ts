import { afterEach, expect, it, vi } from "vitest";
import {
  addFamilyTokens,
  emptyFriendReminder,
  friendReminderKey,
  parseFriendReminder,
  readFriendReminder,
  saveFriendReminder,
} from "../../src/shared/friend-reminders";
afterEach(() => vi.unstubAllGlobals());
it("keeps account/friend pairs distinct while normalizing handle case", () => {
  expect(friendReminderKey("Player_A", "Batu")).toBe(
    friendReminderKey("PLAYER_A", "batu"),
  );
  expect(friendReminderKey("Player_A", "batu")).not.toBe(
    friendReminderKey("Player_B", "batu"),
  );
  expect(() => friendReminderKey("../account", "batu")).toThrow();
});
it("normalizes, deduplicates and preserves ordered family tokens", () => {
  expect(
    addFamilyTokens(["Pop Singers"], " pop singers, Ships   and Boats\nFish "),
  ).toEqual(["Pop Singers", "Ships and Boats", "Fish"]);
  expect(() => addFamilyTokens([], "x".repeat(257))).toThrow("256");
  expect(() =>
    addFamilyTokens(
      Array.from({ length: 50 }, (_, i) => `Family ${i}`),
      "extra",
    ),
  ).toThrow("50");
});
it("does not silently overwrite unsupported or malformed saved data", () => {
  expect(parseFriendReminder(undefined)).toEqual(emptyFriendReminder());
  expect(() =>
    parseFriendReminder({ schemaVersion: 2, notes: "keep", families: [] }),
  ).toThrow();
  expect(() =>
    parseFriendReminder({ schemaVersion: 1, notes: "keep", families: [42] }),
  ).toThrow();
  expect(() =>
    parseFriendReminder({
      schemaVersion: 1,
      notes: "x".repeat(10001),
      families: [],
    }),
  ).toThrow();
});
it("preserves canonical family names containing commas in saved reminders", () => {
  expect(
    parseFriendReminder({
      schemaVersion: 1,
      notes: "keep",
      families: ["Ducks, Geese and Swans"],
    }).families,
  ).toEqual(["Ducks, Geese and Swans"]);
});
it("uses a separate local key per friend without replacing settings or other friends", async () => {
  const data: Record<string, unknown> = {
    "kosmore.settings": { enabled: true },
    [friendReminderKey("me", "other")]: {
      schemaVersion: 1,
      notes: "untouched",
      families: [],
    },
  };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: data[key] })),
        set: vi.fn(async (next: Record<string, unknown>) => {
          Object.assign(data, next);
        }),
      },
    },
  });
  const key = friendReminderKey("me", "batu");
  await saveFriendReminder(key, {
    schemaVersion: 1,
    notes: "Likes ships",
    families: ["Ships and Boats"],
  });
  expect(await readFriendReminder(key)).toEqual({
    schemaVersion: 1,
    notes: "Likes ships",
    families: ["Ships and Boats"],
  });
  expect(data[friendReminderKey("me", "other")]).toMatchObject({
    notes: "untouched",
  });
  expect(data["kosmore.settings"]).toEqual({ enabled: true });
});
it("propagates local storage failures so the editor can keep the draft", async () => {
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        set: vi.fn(async () => {
          throw new Error("quota exceeded");
        }),
      },
    },
  });
  await expect(
    saveFriendReminder(friendReminderKey("me", "batu"), emptyFriendReminder()),
  ).rejects.toThrow("quota exceeded");
});
