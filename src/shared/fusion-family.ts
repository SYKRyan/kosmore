/** A family's tier: how many milestones its collected count has reached. */
export function tierOf(collected: number, milestones: number[]): number {
  let tier = 0;
  for (const m of milestones) if (collected >= m) tier++;
  return tier;
}

/** Roman numerals, as the game writes family tiers. 0 is "no tier". */
export function tierName(tier: number): string {
  if (tier <= 0) return "no tier";
  const numerals: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  for (const [value, numeral] of numerals)
    while (tier >= value) {
      out += numeral;
      tier -= value;
    }
  return out;
}

export interface FamilyEffect {
  name: string;
  /** Tier with the other chosen cards gone (this card excluded). */
  tierBefore: number;
  /** Tier with this card gone too. */
  tierAfter: number;
  /** Cards of the family that can still go after this one before its tier drops. */
  more: number;
}

export type Verdict =
  /** Fusing this card keeps every family tier. */
  | {
      safe: true;
      reason: "no-family" | "spare" | "keeps";
      families: FamilyEffect[];
    }
  /** Fusing this card drops at least one of its families a tier. */
  | { safe: false; drops: FamilyEffect[]; families: FamilyEffect[] };

/**
 * Is this card safe to fuse? A card leaves your collection, and so lowers the
 * count of every family it belongs to, only when all its copies are fused:
 * `leaves` says whether this pick does that. `othersLeaving` counts, per family,
 * the other chosen cards that leave. null when a family's count is unknown.
 */
export function fusionVerdict(
  families: { id: string; name: string }[],
  leaves: boolean,
  counts: Map<string, number>,
  othersLeaving: Map<string, number>,
  milestones: number[],
): Verdict | null {
  if (!families.length)
    return { safe: true, reason: "no-family", families: [] };
  const effects: FamilyEffect[] = [];
  for (const family of families) {
    const collected = counts.get(family.id);
    if (collected === undefined) return null;
    const before = collected - (othersLeaving.get(family.id) ?? 0),
      after = leaves ? before - 1 : before;
    let floor = 0;
    for (const m of milestones) if (before >= m) floor = m;
    effects.push({
      name: family.name,
      tierBefore: tierOf(before, milestones),
      tierAfter: tierOf(after, milestones),
      more: Math.max(0, after - floor),
    });
  }
  if (!leaves) return { safe: true, reason: "spare", families: effects };
  const drops = effects.filter((e) => e.tierAfter < e.tierBefore);
  return drops.length
    ? { safe: false, drops, families: effects }
    : { safe: true, reason: "keeps", families: effects };
}
