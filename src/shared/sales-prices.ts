export const SALE_MINIMUMS = {
  Common: 1,
  Uncommon: 1,
  Rare: 1,
  Epic: 20,
  Legendary: 100,
  Mythic: 500,
};
export type SaleRarity = keyof typeof SALE_MINIMUMS;
export type DiscountMode = "flat" | "percent";

const KOSMO = 1_000_000n;

// Prices and flat adjustments stay in integer millionths of a Kosmo.
function decimalMicros(value: string): bigint | undefined {
  const match = value.match(/^(-?)(\d*)(?:\.(\d{0,6}))?$/);
  if (!match || !(match[2] || match[3])) return;
  const amount =
    BigInt(match[2]) * KOSMO + BigInt((match[3] ?? "").padEnd(6, "0"));
  return match[1] ? -amount : amount;
}

function settingMicros(value: number) {
  const decimal = value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 6,
  });
  if (Number(decimal) === value) return decimalMicros(decimal);
}

export function validSalePrice(value: unknown, minimum = 0): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value >= minimum &&
    settingMicros(value) !== undefined
  );
}

export function validDiscountThreshold(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export function belowSaleMinimum(value: string, minimum: number): boolean {
  const amount = decimalMicros(value.trim());
  return amount !== undefined && amount < settingMicros(minimum)!;
}

function saleInputValue(value: bigint, minimum: number): string {
  const floor = BigInt(minimum) * KOSMO;
  if (value < floor) value = floor;
  const fraction = String(value % KOSMO)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${value / KOSMO}${fraction ? `.${fraction}` : ""}`;
}

function adjustmentMicros(value: unknown): bigint | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  const amount = decimalMicros(String(value));
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (amount !== undefined && amount >= -max && amount <= max) return amount;
}
export function validSaleAdjustment(value: unknown): value is number {
  return adjustmentMicros(value) !== undefined;
}
export function adjustedSalePrice(
  price: string,
  adjustment: number,
  minimum = 1,
): string {
  if (!/^\d+$/.test(price) || !validSaleAdjustment(adjustment))
    throw new Error(
      "Choose a valid price adjustment with up to six decimal places.",
    );
  return saleInputValue(BigInt(price) + adjustmentMicros(adjustment)!, minimum);
}

export function quickSalePrice(price: number, minimum: number): string {
  return saleInputValue(settingMicros(price)!, minimum);
}

export function discountedSalePrice(
  price: string,
  amount: number,
  mode: DiscountMode,
  minimum: number,
): string {
  const previous = BigInt(price),
    configured = settingMicros(amount)!;
  // Round the percentage reduction to a whole Kosmo before subtracting it.
  const divisor = 100n * KOSMO * KOSMO;
  const reduction =
    mode === "flat"
      ? configured
      : ((previous * configured + divisor / 2n) / divisor) * KOSMO;
  return saleInputValue(previous - reduction, minimum);
}
