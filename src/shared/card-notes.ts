import { handleKey } from "../kosmora/social";
import { subjectId } from "../kosmora/contracts";
export const MAX_CARD_NOTE_LENGTH = 10_000;
export interface CardNote {
  schemaVersion: 1;
  text: string;
}
export const emptyCardNote = (): CardNote => ({ schemaVersion: 1, text: "" });
export function cardNoteKey(account: string, id: string): string {
  return `kosmore.cardNotes.${handleKey(account)}.${subjectId(id)}`;
}
export function parseCardNote(value: unknown): CardNote {
  if (value === undefined) return emptyCardNote();
  if (!value || typeof value !== "object")
    throw new Error("Saved card notes could not be read.");
  const v = value as Partial<CardNote>;
  if (
    v.schemaVersion !== 1 ||
    typeof v.text !== "string" ||
    v.text.length > MAX_CARD_NOTE_LENGTH
  )
    throw new Error("Saved card notes use an unsupported format.");
  return { schemaVersion: 1, text: v.text };
}
export async function readCardNote(key: string): Promise<CardNote> {
  return parseCardNote((await chrome.storage.local.get(key))[key]);
}
export async function saveCardNote(
  key: string,
  value: CardNote,
): Promise<void> {
  await chrome.storage.local.set({ [key]: parseCardNote(value) });
}
