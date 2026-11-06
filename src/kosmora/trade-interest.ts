import { count, object, subjectId, text, uuid } from "./contracts";

export const RARITIES = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Legendary",
  "Mythic",
] as const;
export type Rarity = (typeof RARITIES)[number];
export type InterestCounts = Record<Rarity, number>;
export interface InterestEntry {
  key: string;
  rarity: Rarity;
  quantity: number;
}

// The native send picker uses status=available, split=1, sendable=1.
// Its usable count excludes locked copies; available excludes copies on sale/hold.
export function parseInterestPage(value: unknown) {
  const data = object(value);
  if (!Array.isArray(data.items))
    throw new Error("Your collection is unavailable.");
  const items = data.items.map((value): InterestEntry => {
    const item = object(value),
      card = object(item.card),
      id = subjectId(card.subjectId);
    const rarity = text(card.rarity) as Rarity;
    if (!RARITIES.includes(rarity))
      throw new Error("An unfamiliar card rarity was returned.");
    const key =
      item.oneCopy === true
        ? `${id}.c${uuid(item.copy)}`
        : `${id}.${card.fullArt ? "f" : item.veil === true ? "v" : "n"}`;
    const available = count(item.available);
    const usable = item.usable === undefined ? available : count(item.usable);
    return { key, rarity, quantity: Math.min(available, usable) };
  });
  const cursor = data.nextCursor === null ? null : text(data.nextCursor);
  if (cursor !== null && (!cursor || cursor.length > 4096))
    throw new Error("Unfamiliar collection pagination.");
  return { items, cursor };
}

export function interestCounts(entries: InterestEntry[]): InterestCounts {
  const counts = Object.fromEntries(
    RARITIES.map((r) => [r, 0]),
  ) as InterestCounts;
  const seen = new Map<string, InterestEntry>();
  for (const entry of entries) {
    const previous = seen.get(entry.key);
    if (previous) {
      if (
        previous.rarity !== entry.rarity ||
        previous.quantity !== entry.quantity
      )
        throw new Error("Your collection changed while counting. Try again.");
      continue;
    }
    seen.set(entry.key, entry);
    counts[entry.rarity] += entry.quantity;
    if (!Number.isSafeInteger(counts[entry.rarity]))
      throw new Error("Unfamiliar collection count.");
  }
  return counts;
}
