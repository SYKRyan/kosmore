import { handleKey } from "../kosmora/social";
export const MAX_FAMILIES = 50;
export const MAX_FAMILY_LENGTH = 256;
export const MAX_NOTES_LENGTH = 10_000;
export interface FriendReminder {
  schemaVersion: 1;
  notes: string;
  families: string[];
}
export const emptyFriendReminder = (): FriendReminder => ({
  schemaVersion: 1,
  notes: "",
  families: [],
});
export function friendReminderKey(account: string, friend: string): string {
  return `kosmore.friend.${handleKey(account)}.${handleKey(friend)}`;
}
export function addFamilyTokens(families: string[], input: string): string[] {
  return normalizeFamilyTokens([...families, ...input.split(/[,\r\n]+/)]);
}
export function normalizeFamilyTokens(
  families: string[],
  context = "per friend",
): string[] {
  const result: string[] = [];
  for (const part of families) {
    const family = part.trim().replace(/\s+/g, " ");
    if (!family) continue;
    if (family.length > MAX_FAMILY_LENGTH)
      throw new Error(
        `Family names can have up to ${MAX_FAMILY_LENGTH} characters.`,
      );
    if (!result.some((f) => f.toLowerCase() === family.toLowerCase()))
      result.push(family);
    if (result.length > MAX_FAMILIES)
      throw new Error(
        `You can save up to ${MAX_FAMILIES} families ${context}.`,
      );
  }
  return result;
}
export function parseFriendReminder(value: unknown): FriendReminder {
  if (value === undefined) return emptyFriendReminder();
  if (!value || typeof value !== "object")
    throw new Error("Saved friend reminders could not be read.");
  const v = value as Partial<FriendReminder>;
  if (
    v.schemaVersion !== 1 ||
    typeof v.notes !== "string" ||
    v.notes.length > MAX_NOTES_LENGTH ||
    !Array.isArray(v.families) ||
    !v.families.every((f) => typeof f === "string")
  )
    throw new Error("Saved friend reminders use an unsupported format.");
  return {
    schemaVersion: 1,
    notes: v.notes,
    families: normalizeFamilyTokens(v.families),
  };
}
export async function readFriendReminder(key: string): Promise<FriendReminder> {
  return parseFriendReminder((await chrome.storage.local.get(key))[key]);
}
export async function saveFriendReminder(
  key: string,
  value: FriendReminder,
): Promise<void> {
  await chrome.storage.local.set({ [key]: parseFriendReminder(value) });
}
