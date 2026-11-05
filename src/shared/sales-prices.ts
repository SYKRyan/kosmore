// Offsets are in Kosmo; price arithmetic stays in integer millionths.
function adjustmentMicros(value: unknown): bigint | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) return;
  const amount =
    BigInt(match[2]) * 1_000_000n + BigInt((match[3] ?? "").padEnd(6, "0"));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return;
  return match[1] ? -amount : amount;
}
export function validSaleAdjustment(value: unknown): value is number {
  return adjustmentMicros(value) !== undefined;
}
export function adjustedSalePrice(price: string, adjustment: number): string {
  if (!/^\d+$/.test(price) || !validSaleAdjustment(adjustment))
    throw new Error(
      "Choose a valid price adjustment with up to six decimal places.",
    );
  const value = BigInt(price) + adjustmentMicros(adjustment)!;
  if (value <= 0n)
    throw new Error("The adjusted price must be greater than 0 Kosmo.");
  const fraction = String(value % 1_000_000n)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${value / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
}
