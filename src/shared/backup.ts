import { defaults, parseSettings, SETTINGS_KEY } from "./settings";
import { MARKET_FINISHES_KEY, parseMarketFinishes } from "./market-preferences";
import {
  normalizeFamilyTokens,
  parseFriendReminder,
  type FriendReminder,
} from "./friend-reminders";
import { parseCardNote, type CardNote } from "./card-notes";
import {
  NAVIGATION,
  PACK_OPENING,
  HOVER_TOOLTIP,
  hotkeyConflict,
  validShortcutCode,
  type Hotkeys,
  type HoverTooltipId,
  type PackOpeningId,
  type PinnedAlbumHotkeys,
} from "./hotkeys";
import { STAT_CATALOG } from "./stat-catalog";
import { parsePopupPosition } from "./popup-layout";
import {
  SALE_MINIMUMS,
  type SaleRarity,
  validDiscountThreshold,
  validFusionPriceThreshold,
  validSaleAdjustment,
  validSalePrice,
} from "./sales-prices";
import { subjectId, uuid } from "../kosmora/contracts";
import { FINISHES, messageOf, type Finish, type Settings } from "./types";

export const MAX_BACKUP_FILE_BYTES = 32 * 1024 * 1024;
const ACCOUNT = /^[a-z0-9_]{1,24}$/;
const FRIEND_KEY = /^kosmore\.friend\.([a-z0-9_]{1,24})\.([a-z0-9_]{1,24})$/;
const CARD_KEY = /^kosmore\.cardNotes\.([a-z0-9_]{1,24})\.(0|[1-9]\d{0,17})$/;
export type ImportMode = "merge" | "replace";
export interface KosMoreBackup {
  format: "kosmore-backup";
  formatVersion: 1;
  exportedAt: string;
  extensionVersion: string;
  settings: Settings;
  marketFinishes: Finish[];
  friendReminders: { account: string; friend: string; value: FriendReminder }[];
  cardNotes: { account: string; subjectId: string; value: CardNote }[];
}
export type StoredValues = Record<string, unknown>;
export interface BackupStorage {
  get(keys: null): Promise<StoredValues>;
  set(values: StoredValues): Promise<void>;
  remove(keys: string[]): Promise<void>;
  QUOTA_BYTES: number;
}
export interface ImportPreview {
  accounts: string[];
  friends: number;
  cardNotes: number;
  pinnedAlbums: number;
  added: number;
  overwritten: number;
  removed: number;
  unchanged: number;
}
export interface PreparedImport {
  backup: KosMoreBackup;
  mode: ImportMode;
  revision: string;
  preview: ImportPreview;
}

function record(value: unknown, label: string): StoredValues {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as StoredValues;
}
function account(value: unknown): string {
  if (typeof value !== "string" || !ACCOUNT.test(value))
    throw new Error(
      "Backup account and friend identifiers must be normalized Kosmora handles.",
    );
  return value;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
  return value;
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`${label} contains duplicate entries.`);
}

/** Import is stricter than the normal settings reader, which repairs saved values. */
function backupSettings(value: unknown): Settings {
  const raw = record(value, "Settings");
  if (raw.schemaVersion !== 1)
    throw new Error(
      "Unsupported settings version. Update KosMore before importing this backup.",
    );
  const standard = defaults();
  if (Object.hasOwn(raw, "familyBlacklist")) {
    const names = array(raw.familyBlacklist, "Family blacklist");
    if (!names.every((name): name is string => typeof name === "string"))
      throw new Error("Family blacklist entries must be family names.");
    normalizeFamilyTokens(names, "in the family blacklist");
  }
  if (
    Object.hasOwn(raw, "fusionPriceThreshold") &&
    !validFusionPriceThreshold(raw.fusionPriceThreshold)
  )
    throw new Error(
      "The Fusion price threshold must be a nonnegative amount with up to six decimal places.",
    );
  for (const [key, field] of Object.entries(raw)) {
    if (!Object.hasOwn(standard, key))
      throw new Error(
        `Unsupported setting: ${key}. Update KosMore before importing.`,
      );
    if (
      typeof standard[key as keyof Settings] === "boolean" &&
      typeof field !== "boolean"
    )
      throw new Error(`Setting ${key} must be on or off.`);
  }
  for (const [key, min, max] of [
    ["hoverDelayMs", 100, 2000],
    ["dismissDelayMs", 0, 30000],
    ["popupWidth", 320, 1200],
    ["popupHeight", 480, 1600],
    ["friendHoverDelayMs", 100, 2000],
    ["friendDismissDelayMs", 0, 30000],
    ["friendTooltipWidth", 240, 1200],
    ["friendTooltipHeight", 160, 1600],
  ] as const) {
    if (
      Object.hasOwn(raw, key) &&
      (typeof raw[key] !== "number" ||
        !Number.isInteger(raw[key]) ||
        raw[key] < min ||
        raw[key] > max)
    )
      throw new Error(
        `Setting ${key} must be an integer from ${min} to ${max}.`,
      );
  }
  for (const key of [
    "salesLastSaleAdjustment",
    "salesLowestListingAdjustment",
    "salesMyLastListingAdjustment",
  ] as const)
    if (Object.hasOwn(raw, key) && !validSaleAdjustment(raw[key]))
      throw new Error(`Setting ${key} is not a valid price adjustment.`);
  if (
    Object.hasOwn(raw, "salesDiscountAmount") &&
    !validSalePrice(raw.salesDiscountAmount, 1)
  )
    throw new Error("The discount amount must be at least 1.");
  if (
    Object.hasOwn(raw, "salesDiscountMode") &&
    raw.salesDiscountMode !== "flat" &&
    raw.salesDiscountMode !== "percent"
  )
    throw new Error("The discount type must be Flat or Percent.");
  if (
    Object.hasOwn(raw, "salesDiscountThreshold") &&
    !validDiscountThreshold(raw.salesDiscountThreshold)
  )
    throw new Error(
      "The discount threshold must be a whole number of at least 1.",
    );
  if (
    Object.hasOwn(raw, "salesQuickPrices") &&
    !array(raw.salesQuickPrices, "Quick Prices").every((price) =>
      validSalePrice(price),
    )
  )
    throw new Error(
      "Quick Prices must contain positive prices with up to six decimal places.",
    );
  if (Object.hasOwn(raw, "salesCustomMinimums"))
    for (const [rarity, minimum] of Object.entries(
      record(raw.salesCustomMinimums, "Custom rarity minimums"),
    ))
      if (
        !Object.hasOwn(SALE_MINIMUMS, rarity) ||
        !validSalePrice(minimum, SALE_MINIMUMS[rarity as SaleRarity])
      )
        throw new Error(`Invalid custom rarity minimum for ${rarity}.`);
  if (
    Object.hasOwn(raw, "popupPosition") &&
    raw.popupPosition !== null &&
    !parsePopupPosition(raw.popupPosition)
  )
    throw new Error("The saved tooltip position is invalid.");
  if (
    Object.hasOwn(raw, "friendTooltipPosition") &&
    raw.friendTooltipPosition !== null &&
    !parsePopupPosition(raw.friendTooltipPosition)
  )
    throw new Error("The saved friend tooltip position is invalid.");
  if (Object.hasOwn(raw, "pinnedAlbums")) {
    for (const [handle, list] of Object.entries(
      record(raw.pinnedAlbums, "Pinned albums"),
    )) {
      account(handle);
      const ids = array(list, "Pinned album IDs").map(uuid);
      if (ids.length > 200)
        throw new Error("An account can have at most 200 pinned albums.");
      unique(ids, "Pinned albums");
    }
  }
  if (Object.hasOwn(raw, "stats")) {
    const ids = array(raw.stats, "Stat preferences").map((value) => {
      const stat = record(value, "Stat preference");
      if (
        !STAT_CATALOG.some((s) => s.id === stat.id) ||
        typeof stat.enabled !== "boolean"
      )
        throw new Error(
          "Unsupported stat preference. Update KosMore before importing.",
        );
      return stat.id as string;
    });
    unique(ids, "Stat preferences");
  }
  for (const [field, actions] of [
    ["hotkeys", NAVIGATION],
    ["packOpeningHotkeys", PACK_OPENING],
    ["hoverTooltipHotkeys", HOVER_TOOLTIP],
  ] as const) {
    if (!Object.hasOwn(raw, field)) continue;
    const keys = record(raw[field], "Shortcuts");
    for (const [id, value] of Object.entries(keys)) {
      const shortcut = record(value, "Shortcut");
      if (
        !actions.some((item) => item.id === id) ||
        !validShortcutCode(shortcut.code, field !== "hotkeys") ||
        ![shortcut.ctrl, shortcut.alt, shortcut.shift, shortcut.meta].every(
          (flag) => typeof flag === "boolean",
        )
      )
        throw new Error(
          "The backup contains an invalid or unsupported shortcut.",
        );
    }
  }
  const conflict = hotkeyConflict(
    (raw.hotkeys as Hotkeys) ?? {},
    (raw.packOpeningHotkeys as Hotkeys<PackOpeningId>) ?? {},
    validateAlbumHotkeys(raw.pinnedAlbumHotkeys, raw.pinnedAlbums),
    undefined,
    (raw.hoverTooltipHotkeys as Hotkeys<HoverTooltipId>) ?? {},
  );
  if (conflict) throw new Error(conflict);
  return parseSettings(raw);
}

function validateAlbumHotkeys(
  value: unknown,
  pins: unknown,
): PinnedAlbumHotkeys {
  if (value === undefined) return {};
  const shortcuts = record(value, "Pinned album shortcuts");
  const accounts = pins === undefined ? {} : record(pins, "Pinned albums");
  for (const [handle, bindings] of Object.entries(shortcuts)) {
    account(handle);
    const ids = Object.hasOwn(accounts, handle)
      ? array(accounts[handle], "Pinned album IDs")
      : [];
    for (const [id, value] of Object.entries(
      record(bindings, "Album shortcuts"),
    )) {
      const shortcut = record(value, "Album shortcut");
      if (
        !ids.includes(uuid(id)) ||
        !validShortcutCode(shortcut.code) ||
        ![shortcut.ctrl, shortcut.alt, shortcut.shift, shortcut.meta].every(
          (flag) => typeof flag === "boolean",
        )
      ) {
        throw new Error(
          "The backup contains an invalid pinned album shortcut.",
        );
      }
    }
  }
  return shortcuts as PinnedAlbumHotkeys;
}

export function validateBackup(value: unknown): KosMoreBackup {
  const raw = record(value, "Backup");
  if (raw.format !== "kosmore-backup" || raw.formatVersion !== 1)
    throw new Error(
      "Choose a supported KosMore JSON backup (format version 1).",
    );
  if (
    typeof raw.exportedAt !== "string" ||
    !/^\d{4}-\d\d-\d\dT/.test(raw.exportedAt) ||
    !Number.isFinite(Date.parse(raw.exportedAt)) ||
    typeof raw.extensionVersion !== "string" ||
    !raw.extensionVersion.trim() ||
    raw.extensionVersion.length > 80
  )
    throw new Error(
      "The backup's export date or extension version is invalid.",
    );
  const settings = backupSettings(raw.settings);
  const finishes = array(raw.marketFinishes, "Market filters");
  if (!finishes.every((f) => FINISHES.includes(f as Finish)))
    throw new Error("The backup contains an unsupported market finish.");
  unique(finishes as string[], "Market filters");
  const friendReminders = array(raw.friendReminders, "Friend reminders").map(
    (value) => {
      const row = record(value, "Friend reminder");
      // Missing values must not silently turn into empty notes.
      record(row.value, "Friend reminder value");
      return {
        account: account(row.account),
        friend: account(row.friend),
        value: parseFriendReminder(row.value),
      };
    },
  );
  const cardNotes = array(raw.cardNotes, "Card notes").map((value) => {
    const row = record(value, "Card note");
    if (subjectId(row.subjectId) !== row.subjectId)
      throw new Error(
        "Card identifiers must use their normalized decimal form.",
      );
    record(row.value, "Card note value");
    return {
      account: account(row.account),
      subjectId: row.subjectId as string,
      value: parseCardNote(row.value),
    };
  });
  unique(
    friendReminders.map((row) => `${row.account}.${row.friend}`),
    "Friend reminders",
  );
  unique(
    cardNotes.map((row) => `${row.account}.${row.subjectId}`),
    "Card notes",
  );
  return {
    format: "kosmore-backup",
    formatVersion: 1,
    exportedAt: raw.exportedAt,
    extensionVersion: raw.extensionVersion,
    settings,
    marketFinishes: parseMarketFinishes(finishes),
    friendReminders,
    cardNotes,
  };
}

export function parseBackup(text: string): KosMoreBackup {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_FILE_BYTES)
    throw new Error("Choose a backup smaller than 32 MiB.");
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose a KosMore backup file.",
    );
  }
  return validateBackup(value);
}
export function isBackupKey(key: string) {
  return (
    key === SETTINGS_KEY ||
    key === MARKET_FINISHES_KEY ||
    FRIEND_KEY.test(key) ||
    CARD_KEY.test(key)
  );
}
function supported(values: StoredValues): StoredValues {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => isBackupKey(key)),
  );
}
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b, "en")),
        )
      : item,
  );
}
function revision(values: StoredValues) {
  return stable(supported(values));
}

export function createBackup(
  values: StoredValues,
  extensionVersion: string,
  now = new Date(),
): KosMoreBackup {
  const friendReminders: KosMoreBackup["friendReminders"] = [],
    cardNotes: KosMoreBackup["cardNotes"] = [];
  for (const [key, value] of Object.entries(values).sort(([a], [b]) =>
    a.localeCompare(b, "en"),
  )) {
    const friend = key.match(FRIEND_KEY),
      card = key.match(CARD_KEY);
    if (friend)
      friendReminders.push({
        account: friend[1],
        friend: friend[2],
        value: parseFriendReminder(value),
      });
    if (card)
      cardNotes.push({
        account: card[1],
        subjectId: card[2],
        value: parseCardNote(value),
      });
  }
  return validateBackup({
    format: "kosmore-backup",
    formatVersion: 1,
    exportedAt: now.toISOString(),
    extensionVersion,
    settings: Object.hasOwn(values, SETTINGS_KEY)
      ? values[SETTINGS_KEY]
      : defaults(),
    marketFinishes: Object.hasOwn(values, MARKET_FINISHES_KEY)
      ? values[MARKET_FINISHES_KEY]
      : [...FINISHES],
    friendReminders,
    cardNotes,
  });
}
export function serializeBackup(backup: KosMoreBackup) {
  return `${JSON.stringify(validateBackup(backup), null, 2)}\n`;
}
export function backupFilename(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `KosMore-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;
}
function backupValues(backup: KosMoreBackup): StoredValues {
  return Object.fromEntries([
    [SETTINGS_KEY, backup.settings],
    [MARKET_FINISHES_KEY, backup.marketFinishes],
    ...backup.friendReminders.map((row) => [
      `kosmore.friend.${row.account}.${row.friend}`,
      row.value,
    ]),
    ...backup.cardNotes.map((row) => [
      `kosmore.cardNotes.${row.account}.${row.subjectId}`,
      row.value,
    ]),
  ]);
}
function importValues(
  backup: KosMoreBackup,
  mode: ImportMode,
  current: StoredValues,
) {
  const writes = backupValues(backup);
  if (mode === "merge") {
    const existing = parseSettings(current[SETTINGS_KEY]);
    const pinnedAlbumHotkeys = { ...existing.pinnedAlbumHotkeys };
    for (const handle of Object.keys(backup.settings.pinnedAlbums))
      delete pinnedAlbumHotkeys[handle];
    const settings = {
      ...backup.settings,
      pinnedAlbums: {
        ...existing.pinnedAlbums,
        ...backup.settings.pinnedAlbums,
      },
      pinnedAlbumHotkeys: {
        ...pinnedAlbumHotkeys,
        ...backup.settings.pinnedAlbumHotkeys,
      },
    };
    const conflict = hotkeyConflict(
      settings.hotkeys,
      settings.packOpeningHotkeys,
      settings.pinnedAlbumHotkeys,
      undefined,
      settings.hoverTooltipHotkeys,
    );
    if (conflict) throw new Error(conflict);
    writes[SETTINGS_KEY] = settings;
  }
  const remove =
    mode === "replace"
      ? Object.keys(supported(current)).filter(
          (key) => !Object.hasOwn(writes, key),
        )
      : [];
  return { writes, remove };
}
/** Count account pin lists separately so preview includes accounts removed from settings. */
function entries(values: StoredValues): StoredValues {
  const result = supported(values);
  if (Object.hasOwn(result, SETTINGS_KEY)) {
    const { pinnedAlbums, pinnedAlbumHotkeys, ...preferences } = parseSettings(
      result[SETTINGS_KEY],
    );
    result[SETTINGS_KEY] = preferences;
    for (const [handle, ids] of Object.entries(pinnedAlbums))
      result[`pins:${handle}`] = {
        ids,
        hotkeys: Object.hasOwn(pinnedAlbumHotkeys, handle)
          ? pinnedAlbumHotkeys[handle]
          : {},
      };
  }
  return result;
}
export function prepareImport(
  value: KosMoreBackup,
  mode: ImportMode,
  current: StoredValues,
): PreparedImport {
  if (mode !== "merge" && mode !== "replace")
    throw new Error("Choose Merge or Replace.");
  const backup = validateBackup(value),
    { writes, remove } = importValues(backup, mode, current);
  const before = entries(current),
    after = entries({ ...current, ...writes });
  for (const key of remove) delete after[key];
  const preview: ImportPreview = {
    accounts: [
      ...new Set([
        ...Object.keys(backup.settings.pinnedAlbums),
        ...backup.friendReminders.map((row) => row.account),
        ...backup.cardNotes.map((row) => row.account),
      ]),
    ].sort(),
    friends: backup.friendReminders.length,
    cardNotes: backup.cardNotes.length,
    pinnedAlbums: Object.values(backup.settings.pinnedAlbums).reduce(
      (sum, ids) => sum + ids.length,
      0,
    ),
    added: 0,
    overwritten: 0,
    removed: 0,
    unchanged: 0,
  };
  for (const [key, entry] of Object.entries(after)) {
    if (!Object.hasOwn(before, key)) preview.added++;
    else if (stable(before[key]) !== stable(entry)) preview.overwritten++;
    else preview.unchanged++;
  }
  for (const key of Object.keys(before))
    if (!Object.hasOwn(after, key)) preview.removed++;
  return { backup, mode, revision: revision(current), preview };
}
export function storageBytes(values: StoredValues) {
  const encoder = new TextEncoder();
  return Object.entries(values).reduce(
    (sum, [key, value]) =>
      sum +
      encoder.encode(key).length +
      encoder.encode(JSON.stringify(value)).length,
    0,
  );
}
export async function applyImport(
  prepared: PreparedImport,
  storage: BackupStorage = chrome.storage.local,
): Promise<void> {
  const current = await storage.get(null);
  if (revision(current) !== prepared.revision)
    throw new Error(
      "Saved data changed since this preview. Review the updated preview and try again.",
    );
  const backup = validateBackup(prepared.backup);
  if (prepared.mode !== "merge" && prepared.mode !== "replace")
    throw new Error("Choose Merge or Replace.");
  const { writes, remove } = importValues(backup, prepared.mode, current);
  const after = { ...current, ...writes };
  for (const key of remove) delete after[key];
  if (storageBytes(after) > storage.QUOTA_BYTES)
    throw new Error(
      "This import exceeds the browser's KosMore storage limit. Use Replace or reduce the backup's notes before importing.",
    );
  const affected = [...new Set([...Object.keys(writes), ...remove])];
  const snapshot = Object.fromEntries(
    affected
      .filter((key) => Object.hasOwn(current, key))
      .map((key) => [key, current[key]]),
  );
  const added = Object.keys(writes).filter(
    (key) => !Object.hasOwn(current, key),
  );
  try {
    // Removing obsolete records first lets Replace work even when old + new data would exceed quota.
    if (remove.length) await storage.remove(remove);
    await storage.set(writes);
  } catch (error) {
    let restored = true;
    try {
      if (added.length) await storage.remove(added);
    } catch {
      restored = false;
    }
    try {
      if (Object.keys(snapshot).length) await storage.set(snapshot);
    } catch {
      restored = false;
    }
    throw new Error(
      restored
        ? `Import failed; the previous data was restored. ${messageOf(error)}`
        : `Import failed and the previous data could not be fully restored. Keep your backup and try restoring it again. ${messageOf(error)}`,
    );
  }
}
