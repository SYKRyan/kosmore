import { count, object, subjectId, text } from "./contracts";

/** One card in the Fusion page's grid (`GET /api/fusion/cards`). */
export interface FusionCard {
  subjectId: string;
  rarity: string;
  /** Copies you own. Fusing the last one takes the card out of its family. */
  quantity: number;
  family: { id: string; name: string } | null;
}

/** Cards from a `GET /api/fusion/cards` page. Unreadable items are skipped. */
export function parseFusionCards(value: unknown): FusionCard[] {
  const items = object(value).items;
  if (!Array.isArray(items))
    throw new Error("Kosmora returned an unfamiliar fusion list.");
  return items.flatMap((item) => {
    try {
      const entry = object(item),
        card = object(entry.card),
        family = card.primaryFamily == null ? null : object(card.primaryFamily);
      return [
        {
          subjectId: subjectId(card.subjectId),
          rarity: text(card.rarity),
          quantity: count(entry.quantity),
          family: family
            ? { id: text(family.id), name: text(family.name) }
            : null,
        },
      ];
    } catch {
      return [];
    }
  });
}

/** Family tier thresholds from `GET /api/families`, ascending. */
export function parseMilestones(value: unknown): number[] {
  const list = object(value).milestones;
  if (!Array.isArray(list) || !list.length)
    throw new Error("Kosmora returned unfamiliar family milestones.");
  return [...new Set(list.map((m) => count(object(m).count)))]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
}

/** Cards you have collected per family, from `GET /api/me/families`. */
export function parseFamilyCounts(value: unknown): Map<string, number> {
  const list = object(value).families;
  if (!Array.isArray(list))
    throw new Error("Kosmora returned an unfamiliar family list.");
  const counts = new Map<string, number>();
  for (const item of list) {
    const family = object(item);
    counts.set(text(family.id), count(family.collected));
  }
  return counts;
}

/** Cards per fusion for each rarity, from the game's `GET /api/fusion` (talents applied). */
export function parseRecipes(value: unknown): Map<string, number> {
  const list = object(value).recipes;
  if (!Array.isArray(list))
    throw new Error("Kosmora returned unfamiliar fusion recipes.");
  const cost = new Map<string, number>();
  for (const item of list) {
    const recipe = object(item),
      cards = count(recipe.cards);
    if (cards > 0) cost.set(text(recipe.from), cards);
  }
  return cost;
}

/** One page of `GET /api/me/families`: collected per family, and the total. */
export function parseFamilyCountsPage(value: unknown): {
  counts: Map<string, number>;
  total: number;
} {
  const total = object(value).total;
  return {
    counts: parseFamilyCounts(value),
    total: typeof total === "number" && Number.isSafeInteger(total) ? total : 0,
  };
}
