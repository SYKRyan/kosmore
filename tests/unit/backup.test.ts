import { describe, expect, it, vi } from "vitest";
import {
  applyImport,
  backupFilename,
  createBackup,
  isBackupKey,
  MAX_BACKUP_FILE_BYTES,
  parseBackup,
  prepareImport,
  serializeBackup,
  storageBytes,
  validateBackup,
  type BackupStorage,
  type KosMoreBackup,
  type StoredValues,
} from "../../src/shared/backup";
import { defaults, SETTINGS_KEY } from "../../src/shared/settings";
import { MARKET_FINISHES_KEY } from "../../src/shared/market-preferences";
import { ALBUM_A, ALBUM_B } from "../fixtures/data";

const note = (text: string) => ({ schemaVersion: 1 as const, text });
it("excludes disposable listing-price and history caches from exports", () => {
  const backup = serializeBackup(
    createBackup(
      {
        ...values(),
        "kosmore.myListingPrices": {
          v: 1,
          entries: { "player:42": { privateCache: "cached-listing-only" } },
        },
        "kosmore.listingHistory.player": {
          privateCache: "cached-history-only",
        },
      },
      "1.2.0",
    ),
  );
  expect(backup).not.toContain("cached-listing-only");
  expect(backup).not.toContain("cached-history-only");
});
const reminder = (
  notes: string,
  families = ["Film and Television Actors", "Arts, Crafts & Design"],
) => ({ schemaVersion: 1 as const, notes, families });
function values(): StoredValues {
  return {
    [SETTINGS_KEY]: {
      ...defaults(),
      popupWidth: 560,
      disableHoverTooltipInPulsar: true,
      disableCardOverlaysInPulsar: true,
      disableHoverTooltipInVortex: true,
      disableCardOverlaysInVortex: true,
      showVortexFamilyOverlay: false,
      useFamilyBlacklist: true,
      socialRemindersPinned: true,
      familyBlacklist: ["Asteroids", "Ducks, Geese and Swans"],
      salesLastSaleAdjustment: -1.25,
      popupPosition: { left: 100, top: 50 },
      pinnedAlbums: { player: [ALBUM_B, ALBUM_A], other: [] },
      hotkeys: {
        collection: {
          code: "KeyC",
          ctrl: false,
          alt: true,
          shift: false,
          meta: false,
        },
      },
      stats: [...defaults().stats]
        .reverse()
        .map((entry, index) => ({ ...entry, enabled: index !== 0 })),
    },
    [MARKET_FINISHES_KEY]: ["veil"],
    "kosmore.friend.player.absentfriend": reminder(
      "Gift ideas: 星\nKeep punctuation, please.",
    ),
    "kosmore.friend.other.batu": reminder("Other account", []),
    "kosmore.cardNotes.player.42": note("Northern lights 🌌\nSecond line"),
    "kosmore.cardNotes.other.99": note("Other account's note"),
    "kosmore.popup.123": { pinned: true },
    "unrelated.key": { token: "excluded" },
  };
}
function memory(initial: StoredValues = {}, quota = 10 * 1024 * 1024) {
  let data = structuredClone(initial);
  const storage: BackupStorage = {
    QUOTA_BYTES: quota,
    get: vi.fn(async () => structuredClone(data)),
    set: vi.fn(async (next: StoredValues) => {
      data = { ...data, ...structuredClone(next) };
    }),
    remove: vi.fn(async (keys: string[]) => {
      for (const key of keys) delete data[key];
    }),
  };
  return { storage, data: () => data };
}
function backup() {
  return createBackup(values(), "0.2.2", new Date("2026-11-05T18:00:00Z"));
}

it("round-trips every saved setting and account's notes without session state or unknown keys", async () => {
  const source = values(),
    exported = backup();
  expect(parseBackup(serializeBackup(exported))).toEqual(exported);
  expect(serializeBackup(exported)).not.toContain("excluded");
  expect(serializeBackup(exported)).not.toContain("kosmore.popup");
  const destination = memory();
  await applyImport(prepareImport(exported, "merge", {}), destination.storage);
  expect(
    createBackup(destination.data(), "0.2.2", new Date(exported.exportedAt)),
  ).toEqual(exported);
  expect(destination.data()["kosmore.friend.player.absentfriend"]).toEqual(
    source["kosmore.friend.player.absentfriend"],
  );
  expect(
    (destination.data()[SETTINGS_KEY] as ReturnType<typeof defaults>)
      .pinnedAlbums.player,
  ).toEqual([ALBUM_B, ALBUM_A]);
});
it("exports usable defaults from a new installation and names files by local time", () => {
  expect(createBackup({}, "0.2.2").settings).toEqual(defaults());
  expect(backupFilename(new Date(2026, 10, 5, 9, 8, 7))).toBe(
    "KosMore-backup-2026-11-05-090807.json",
  );
});
it("imports older family settings and round-trips independent family impact choices", async () => {
  for (const mode of ["merge", "replace"] as const) {
    const old = JSON.parse(serializeBackup(backup()));
    delete old.settings.familyImpactOverlaysEnabled;
    delete old.settings.showSalesFamilyOverlay;
    delete old.settings.useFamilyBlacklist;
    delete old.settings.socialRemindersEnabled;
    delete old.settings.socialRemindersPinned;
    delete old.settings.familyBlacklist;
    delete old.settings.disableHoverTooltipInVortex;
    delete old.settings.disableCardOverlaysInVortex;
    old.settings.showFusionFamilyOverlay = false;
    const destination = memory();
    await applyImport(prepareImport(old, mode, {}), destination.storage);
    expect(destination.data()[SETTINGS_KEY]).toMatchObject({
      familyImpactOverlaysEnabled: true,
      showSalesFamilyOverlay: true,
      useFamilyBlacklist: false,
      socialRemindersEnabled: true,
      socialRemindersPinned: false,
      familyBlacklist: [],
      disableHoverTooltipInVortex: false,
      disableCardOverlaysInVortex: false,
      showFusionFamilyOverlay: false,
      showVortexFamilyOverlay: false,
    });
  }
  const current = backup();
  current.settings.familyImpactOverlaysEnabled = false;
  current.settings.showSalesFamilyOverlay = false;
  expect(parseBackup(serializeBackup(current)).settings).toMatchObject({
    familyImpactOverlaysEnabled: false,
    showSalesFamilyOverlay: false,
  });
  const invalid = JSON.parse(serializeBackup(current));
  invalid.settings.showSalesFamilyOverlay = "false";
  expect(() => validateBackup(invalid)).toThrow("must be on or off");
});
it("validates blacklist tokens in backups rather than silently discarding invalid values", () => {
  for (const list of [
    "Asteroids",
    [7],
    ["x".repeat(257)],
    Array.from({ length: 51 }, (_, i) => `Family ${i}`),
  ]) {
    const raw = JSON.parse(serializeBackup(backup()));
    raw.settings.familyBlacklist = list;
    expect(() => validateBackup(raw)).toThrow();
  }
  const raw = JSON.parse(serializeBackup(backup()));
  raw.settings.useFamilyBlacklist = "false";
  expect(() => validateBackup(raw)).toThrow("must be on or off");
});

it("merges imported preferences and whole records while retaining destination-only data and pin lists", async () => {
  const current = {
    ...values(),
    [SETTINGS_KEY]: {
      ...defaults(),
      popupWidth: 700,
      pinnedAlbums: { player: [ALBUM_A], destination: [ALBUM_A] },
    },
    "kosmore.friend.player.absentfriend": reminder("Destination notes", [
      "Astronomy",
    ]),
    "kosmore.friend.player.extra": reminder("Keep me"),
    "kosmore.cardNotes.player.123": note("Destination only"),
  };
  const imported = backup();
  imported.friendReminders[0].value = reminder("", []);
  imported.cardNotes.find((row) => row.account === "player")!.value = note("");
  const h = memory(current),
    prepared = prepareImport(imported, "merge", current);
  expect(prepared.preview.removed).toBe(0);
  expect(prepared.preview.overwritten).toBeGreaterThan(0);
  await applyImport(prepared, h.storage);
  expect(h.data()["kosmore.friend.player.extra"]).toEqual(reminder("Keep me"));
  expect(h.data()["kosmore.cardNotes.player.123"]).toEqual(
    note("Destination only"),
  );
  expect(
    h.data()[
      `kosmore.friend.${imported.friendReminders[0].account}.${imported.friendReminders[0].friend}`
    ],
  ).toEqual(reminder("", []));
  expect(h.data()["kosmore.cardNotes.player.42"]).toEqual(note(""));
  const settings = h.data()[SETTINGS_KEY] as ReturnType<typeof defaults>;
  expect(settings.popupWidth).toBe(560);
  expect(settings.pinnedAlbums).toEqual({
    player: [ALBUM_B, ALBUM_A],
    other: [],
    destination: [ALBUM_A],
  });
  expect(h.storage.remove).not.toHaveBeenCalled();
});
it("replaces only supported settings and notes, preserving unrelated and session keys", async () => {
  const current: StoredValues = {
    ...values(),
    "kosmore.friend.player.extra": reminder("Remove me"),
    "kosmore.cardNotes.destination.123": note("Remove me too"),
    [SETTINGS_KEY]: { ...defaults(), pinnedAlbums: { destination: [ALBUM_A] } },
  };
  const h = memory(current),
    prepared = prepareImport(backup(), "replace", current);
  expect(prepared.preview.accounts).toEqual(["other", "player"]);
  expect(prepared.preview).toMatchObject({
    friends: 2,
    cardNotes: 2,
    pinnedAlbums: 2,
    removed: 3,
  });
  await applyImport(prepared, h.storage);
  expect(h.data()["kosmore.friend.player.extra"]).toBeUndefined();
  expect(h.data()["kosmore.cardNotes.destination.123"]).toBeUndefined();
  expect(h.data()["unrelated.key"]).toEqual(current["unrelated.key"]);
  expect(h.data()["kosmore.popup.123"]).toEqual(current["kosmore.popup.123"]);
  expect(
    (h.data()[SETTINGS_KEY] as ReturnType<typeof defaults>).pinnedAlbums,
  ).toEqual(backup().settings.pinnedAlbums);
});
it("ignores arbitrary extra backup fields and preserves handles that are object property names safely", async () => {
  const imported = JSON.parse(serializeBackup(backup()));
  imported.storage = { "unrelated.key": "overwrite" };
  imported.settings.pinnedAlbums = JSON.parse(
    `{"__proto__":["${ALBUM_A}"],"constructor":[]}`,
  );
  imported.friendReminders.push({
    account: "__proto__",
    friend: "constructor",
    value: reminder("safe"),
  });
  const parsed = validateBackup(imported),
    h = memory({ "unrelated.key": "keep" });
  await applyImport(prepareImport(parsed, "merge", h.data()), h.storage);
  expect(Object.getPrototypeOf(parsed.settings.pinnedAlbums)).toBe(
    Object.prototype,
  );
  expect(Object.hasOwn(parsed.settings.pinnedAlbums, "__proto__")).toBe(true);
  expect(h.data()["unrelated.key"]).toBe("keep");
  expect(h.data()["kosmore.friend.__proto__.constructor"]).toEqual(
    reminder("safe"),
  );
});
it("accepts missing optional settings using current defaults and accepts an empty market filter", () => {
  const imported = JSON.parse(serializeBackup(backup()));
  delete imported.settings.salesOverlaysEnabled;
  imported.marketFinishes = [];
  expect(validateBackup(imported).settings.salesOverlaysEnabled).toBe(true);
  expect(validateBackup(imported).marketFinishes).toEqual([]);
});
describe("invalid backups", () => {
  it.each([
    (b: KosMoreBackup) => {
      b.formatVersion = 2 as 1;
    },
    (b: KosMoreBackup) => {
      b.settings.schemaVersion = 2 as 1;
    },
    (b: KosMoreBackup) => {
      b.settings.popupWidth = 100;
    },
    (b: KosMoreBackup) => {
      b.settings.enabled = "true" as unknown as boolean;
    },
    (b: KosMoreBackup) => {
      b.settings.salesLastSaleAdjustment = NaN;
    },
    (b: KosMoreBackup) => {
      b.settings.salesMyLastListingAdjustment = NaN;
    },
    (b: KosMoreBackup) => {
      b.settings.pinnedAlbums.player = ["bad-id"];
    },
    (b: KosMoreBackup) => {
      b.settings.pinnedAlbums.player = [ALBUM_A, ALBUM_A];
    },
    (b: KosMoreBackup) => {
      b.settings.pinnedAlbums.BAD = [];
    },
    (b: KosMoreBackup) => {
      b.friendReminders.push(b.friendReminders[0]);
    },
    (b: KosMoreBackup) => {
      b.cardNotes.push(b.cardNotes[0]);
    },
    (b: KosMoreBackup) => {
      b.friendReminders[0].account = "Other.Account";
    },
    (b: KosMoreBackup) => {
      b.cardNotes[0].subjectId = "00042";
    },
    (b: KosMoreBackup) => {
      b.friendReminders[0].value.notes = "x".repeat(10001);
    },
    (b: KosMoreBackup) => {
      b.cardNotes[0].value.text = "x".repeat(10001);
    },
    (b: KosMoreBackup) => {
      b.friendReminders[0].value.families = Array.from(
        { length: 51 },
        (_, i) => `Family ${i}`,
      );
    },
    (b: KosMoreBackup) => {
      b.cardNotes[0].value = undefined as unknown as CardNoteValue;
    },
    (b: KosMoreBackup) => {
      b.exportedAt = "not a date";
    },
    (b: KosMoreBackup) => {
      b.settings.stats.push(b.settings.stats[0]);
    },
    (b: KosMoreBackup) => {
      b.marketFinishes = ["plain", "plain"];
    },
  ])("rejects invalid data before any storage write (%#)", async (change) => {
    const imported = backup();
    change(imported);
    expect(() => validateBackup(imported)).toThrow();
    const h = memory();
    await expect(
      applyImport(
        { ...prepareImport(backup(), "merge", {}), backup: imported },
        h.storage,
      ),
    ).rejects.toThrow();
    expect(h.storage.set).not.toHaveBeenCalled();
    expect(h.storage.remove).not.toHaveBeenCalled();
  });
  it("rejects invalid JSON, oversized files, invalid shortcuts and conflicting keys", () => {
    expect(() => parseBackup("{bad")).toThrow("not valid JSON");
    expect(() => parseBackup(" ".repeat(MAX_BACKUP_FILE_BYTES + 1))).toThrow(
      "32 MiB",
    );
    const imported = backup();
    imported.settings.hotkeys.home = imported.settings.hotkeys.collection;
    expect(() => validateBackup(imported)).toThrow("both use");
    imported.settings.hotkeys = {
      home: {
        code: "Enter",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      },
    };
    expect(() => validateBackup(imported)).toThrow("shortcut");
    expect(isBackupKey("authentication")).toBe(false);
    expect(isBackupKey("kosmore.friend.BAD.friend")).toBe(false);
  });
});
type CardNoteValue = KosMoreBackup["cardNotes"][number]["value"];
it("checks the final quota before making changes, including unrelated data and UTF-8 notes", async () => {
  const current = { "unrelated.key": "x".repeat(1000) },
    h = memory(current, 1100);
  await expect(
    applyImport(prepareImport(backup(), "merge", current), h.storage),
  ).rejects.toThrow("storage limit");
  expect(h.storage.set).not.toHaveBeenCalled();
  expect(h.storage.remove).not.toHaveBeenCalled();
  expect(storageBytes({ a: "🌌" })).toBe(7);
});
it("can replace full storage when old plus imported notes would exceed quota", async () => {
  const imported = backup(),
    current = { "kosmore.cardNotes.player.500": note("x".repeat(10000)) };
  const h = memory(
    current,
    Math.max(storageBytes(current), storageBytes(values())) + 50,
  );
  await applyImport(prepareImport(imported, "replace", current), h.storage);
  expect(h.data()["kosmore.cardNotes.player.500"]).toBeUndefined();
  expect(h.storage.remove).toHaveBeenCalledBefore(
    h.storage.set as ReturnType<typeof vi.fn>,
  );
});
it("requires a new preview after another tab saves, while ignoring unrelated storage changes", async () => {
  const h = memory(values()),
    prepared = prepareImport(backup(), "replace", h.data());
  await h.storage.set({ "kosmore.cardNotes.player.777": note("Newer notes") });
  await expect(applyImport(prepared, h.storage)).rejects.toThrow(
    "changed since",
  );
  expect(h.data()["kosmore.cardNotes.player.777"]).toEqual(note("Newer notes"));
  const fresh = prepareImport(backup(), "merge", h.data());
  await h.storage.set({ arbitrary: 1 });
  await applyImport(fresh, h.storage);
  expect(h.data().arbitrary).toBe(1);
});
it("restores deleted and overwritten records after a failed write", async () => {
  const current = {
      ...values(),
      "kosmore.cardNotes.player.500": note("Keep on failure"),
    },
    h = memory(current);
  const normal = h.storage.set;
  h.storage.set = vi
    .fn()
    .mockImplementationOnce(async (next) => {
      await normal(next); // Also cover a partially committed write.
      throw new Error("disk unavailable");
    })
    .mockImplementation(normal);
  await expect(
    applyImport(
      prepareImport(createBackup({}, "0.2.2"), "replace", current),
      h.storage,
    ),
  ).rejects.toThrow("previous data was restored");
  expect(h.data()).toEqual(current);
});
it("reports a failed rollback without claiming success", async () => {
  const h = memory(values());
  h.storage.set = vi.fn(async () => {
    throw new Error("storage unavailable");
  });
  await expect(
    applyImport(prepareImport(backup(), "replace", h.data()), h.storage),
  ).rejects.toThrow("could not be fully restored");
});
it("restores the snapshot even if removing obsolete Replace records fails partway through", async () => {
  const current = { ...values(), "kosmore.cardNotes.player.500": note("Keep") },
    h = memory(current);
  const normal = h.storage.remove;
  h.storage.remove = vi
    .fn()
    .mockImplementationOnce(async (keys) => {
      await normal(keys);
      throw new Error("Removal interrupted");
    })
    .mockImplementation(normal);
  await expect(
    applyImport(
      prepareImport(createBackup({}, "0.2.2"), "replace", current),
      h.storage,
    ),
  ).rejects.toThrow("previous data was restored");
  expect(h.data()).toEqual(current);
});
