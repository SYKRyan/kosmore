import { contextKey, resolveCard } from "./dom";
import type { CardContext } from "../shared/types";

export interface SalesTarget {
  input: HTMLInputElement;
  after: HTMLElement;
  context: CardContext;
  key: string;
}
export function salesTargets(
  doc: Document = document,
): Map<HTMLInputElement, SalesTarget> {
  const result = new Map<HTMLInputElement, SalesTarget>();
  const url = new URL(doc.location.href);
  const add = (
    input: HTMLInputElement | null,
    after: HTMLElement | null,
    card: Element | null,
  ) => {
    if (!input || !after || !card || input.closest("[hidden],[inert]")) return;
    const context = resolveCard(card, doc);
    if (!context) return;
    result.set(input, { input, after, context, key: contextKey(context) });
  };
  if (url.pathname === "/market/sell/batch") {
    for (const row of doc.querySelectorAll<HTMLElement>(".bsell-row"))
      add(
        row.querySelector<HTMLInputElement>(
          ".bsell-prices .bsell-input input,.bsell-prices label input",
        ),
        row.querySelector<HTMLElement>(".bsell-prices"),
        row.querySelector(".bsell-head"),
      );
  } else if (url.pathname === "/market/sell") {
    const input = doc.querySelector<HTMLInputElement>(
      'form.sell-form input[data-testid="sell-start"]',
    );
    const visual =
      input?.closest(".deal")?.querySelector(".deal-visual .kc-article") ??
      null;
    const context = visual ? resolveCard(visual, doc) : null;
    // Wait out a subject navigation before attaching an old form to a new URL.
    if (
      context &&
      (!url.searchParams.has("subject") ||
        url.searchParams.get("subject")?.replace(/^0+(?=\d)/, "") ===
          context.subjectId)
    )
      add(input, input?.closest<HTMLElement>("label.fld-big") ?? null, visual);
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
  const win = input.ownerDocument.defaultView!;
  // Bypass the instance value tracker so controlled inputs see a user-style edit.
  Object.getOwnPropertyDescriptor(
    win.HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value);
  input.dispatchEvent(
    new win.Event("input", { bubbles: true, composed: true }),
  );
  input.dispatchEvent(
    new win.Event("change", { bubbles: true, composed: true }),
  );
}
