import { contextKey, resolveCard } from "./dom";
import type { CardContext } from "../shared/types";
import { SALE_MINIMUMS, type SaleRarity } from "../shared/sales-prices";
import { listingCopyId } from "./my-listings";

export interface SalesTarget {
  input: HTMLInputElement;
  after: HTMLElement;
  context: CardContext;
  key: string;
  rarity?: SaleRarity;
  copyId?: string;
}
const RARITIES = Object.keys(SALE_MINIMUMS) as SaleRarity[];
const BATCH_INPUT =
  ".bsell-prices .bsell-input input,.bsell-prices label input";
const SELL_INPUT = 'form.sell-form input[data-testid="sell-start"]';
export const SALES_SUMMARY_WARNING = '[data-kosmore-sales-warning="summary"]';
export function singleSaleCard(
  doc: Document,
  deal: Element | null = doc.querySelector(".deal"),
): CardContext | null {
  const url = new URL(doc.location.href);
  if (url.pathname !== "/market/sell") return null;
  const card = deal?.querySelector(".deal-visual .kc-article");
  const context = card ? resolveCard(card, doc) : null;
  const subject = url.searchParams.get("subject")?.replace(/^0+(?=\d)/, "");
  return subject === undefined || subject === context?.subjectId ? context : null;
}
export function salesTarget(
  input: HTMLInputElement,
  doc: Document = document,
): SalesTarget | undefined {
  if (
    !input.isConnected ||
    input.closest('[hidden],[inert],[aria-hidden="true"]')
  )
    return;
  const url = new URL(doc.location.href);
  let after: HTMLElement | null = null;
  let card: Element | null = null;
  let context: CardContext | null = null;
  if (url.pathname === "/market/sell/batch") {
    const row = input.closest(".bsell-row");
    if (!row || row.querySelector(BATCH_INPUT) !== input) return;
    after = row.querySelector<HTMLElement>(".bsell-prices");
    card = row.querySelector(".bsell-head");
    context = card && resolveCard(card, doc);
  } else if (url.pathname === "/market/sell" && input.matches(SELL_INPUT)) {
    after = input.closest<HTMLElement>("label.fld-big");
    context = singleSaleCard(doc, input.closest(".deal"));
    card = context?.anchor ?? null;
  }
  if (!after || !card || !context) return;
  const article = card.matches(".kc-article")
    ? card
    : card.querySelector(".kc-article");
  const face = card.querySelector(".kc");
  const metadata = card
    .querySelector(".bsell-meta")
    ?.textContent?.split("·")[0]
    ?.trim();
  const label = article
    ?.getAttribute("aria-label")
    ?.split(",")
    .map((part) => part.trim());
  const rarity =
    RARITIES.find((name) =>
      face?.classList.contains(`kc-${name.toLowerCase()}`),
    ) ??
    RARITIES.find(
      (name) =>
        metadata?.toLowerCase() === name.toLowerCase() ||
        label
          ?.slice(1)
          .some((part) => part.toLowerCase() === name.toLowerCase()),
    );
  const copyId = listingCopyId(
    url.pathname === "/market/sell"
      ? (url.searchParams.get("instance") ?? context.copyId)
      : card.closest(".bsell-row")?.getAttribute("data-instance-id"),
  );
  return { input, after, context, key: contextKey(context), rarity, copyId };
}

export function salesSubmitButton(): HTMLButtonElement | undefined {
  if (location.pathname === "/market/sell")
    return (
      document.querySelector<HTMLButtonElement>(
        'form.sell-form button[type="submit"]',
      ) ?? undefined
    );
  const batch = document.querySelector(".bsell");
  return (
    document.querySelector<HTMLButtonElement>(
      ".bsell-bar > button.ui-btn-primary",
    ) ??
    batch?.querySelector<HTMLButtonElement>('[data-testid="submit-sales"]') ??
    [...(batch?.querySelectorAll("button") ?? [])].find((button) =>
      /^(?:list for sale|put (?:cards )?on sale)\b/i.test(
        button.textContent?.trim() ?? "",
      ),
    )
  );
}
export function salesTargets(
  doc: Document = document,
  scope: Document | Element = doc,
): Map<HTMLInputElement, SalesTarget> {
  const result = new Map<HTMLInputElement, SalesTarget>();
  if (!/^\/market\/sell(?:\/batch)?$/.test(doc.location.pathname))
    return result;
  const container =
    scope instanceof Element
      ? (scope.closest(".bsell-row,.deal") ?? scope)
      : scope;
  const selector = doc.location.pathname.endsWith("/batch")
    ? BATCH_INPUT
    : SELL_INPUT;
  for (const input of container.querySelectorAll<HTMLInputElement>(selector)) {
    const target = salesTarget(input, doc);
    if (target) result.set(input, target);
  }
  return result;
}
export function editableSalesInput(input: HTMLInputElement): boolean {
  return (
    input.isConnected &&
    !input.matches(":disabled") &&
    !input.readOnly &&
    input.getAttribute("aria-readonly") !== "true"
  );
}
export function fillSalesInput(input: HTMLInputElement, value: string): void {
  if (!editableSalesInput(input))
    throw new Error("This starting price is read-only.");
  // Reapplying an unchanged amount must not send another edit to the game's formatter.
  const displayed = input.value;
  if (
    displayed === value ||
    (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(displayed) &&
      displayed.replaceAll(",", "") === value)
  )
    return;
  const win = input.ownerDocument.defaultView!;
  // Bypass the instance value tracker so controlled inputs see a user-style edit.
  Object.getOwnPropertyDescriptor(
    win.HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value);
  input.dispatchEvent(
    new win.InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertReplacementText",
      data: value,
    }),
  );
  input.dispatchEvent(
    new win.Event("change", { bubbles: true, composed: true }),
  );
}
