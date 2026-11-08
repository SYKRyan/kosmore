import type { CardContext } from "./types";

/** Only selection identities cross the page relay, never draft prices. */
export const RELAY_SALE_BATCH = "kosmore.saleBatch";
export interface SaleBatchMessage {
  type: typeof RELAY_SALE_BATCH;
  page: string;
  revision: number;
  source: "batch" | "draft";
  keys: string[];
}
const KEY = /^(0|[1-9]\d{0,17})(?:\.[vf])?$/;
export function saleSelectionKey(card: CardContext): string {
  return `${card.subjectId}${card.variant.veil ? ".v" : card.variant.fullArt ? ".f" : ""}`;
}
export function saleSelectionKeys(
  value: unknown,
  source: "batch" | "draft",
): string[] | undefined {
  if (!value || typeof value !== "object") return;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return;
  const keys: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") return;
    const item = raw as Record<string, unknown>;
    if (source === "batch" && item.block) continue;
    if (
      source === "batch" &&
      (!item.instanceId || !item.card || !item.rarity || !item.suggestion)
    )
      return;
    const key =
      source === "batch" && typeof item.key === "string"
        ? item.key
        : `${item.subjectId}${item.veil ? ".v" : item.fullArt ? ".f" : ""}`;
    if (!KEY.test(key)) return;
    keys.push(key);
  }
  return [...new Set(keys)];
}
export function isSaleBatchMessage(value: unknown): value is SaleBatchMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<SaleBatchMessage>;
  return (
    m.type === RELAY_SALE_BATCH &&
    typeof m.page === "string" &&
    Number.isSafeInteger(m.revision) &&
    (m.revision ?? 0) > 0 &&
    (m.source === "batch" || m.source === "draft") &&
    Array.isArray(m.keys) &&
    m.keys.every((key) => typeof key === "string" && KEY.test(key))
  );
}
