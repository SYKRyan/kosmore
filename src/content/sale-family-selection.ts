import { resolveCard } from "../kosmora/dom";
import { salesTarget, type SalesTarget } from "../kosmora/sales";
import {
  isSaleBatchMessage,
  saleSelectionKey,
} from "../shared/sale-family-selection";

/** Small, tab-local selection cache: DOM rows are authoritative when unfiltered. */
export class SaleFamilySelection {
  private page = "";
  private picker?: HTMLElement;
  private picked = new Set<string>();
  private batch?: Set<string>;
  private candidates = new Set<string>();
  private removed = new Set<string>();
  private revision = 0;

  constructor(
    private win: Window,
    private changed: () => void,
  ) {}

  reset() {
    this.picker = undefined;
    this.picked.clear();
    this.batch = undefined;
    this.candidates.clear();
    this.removed.clear();
    this.revision = 0;
  }

  private syncPage() {
    if (this.page === this.win.location.href) return;
    this.page = this.win.location.href;
    this.reset();
  }

  start() {
    const message = (event: MessageEvent) => {
      if (
        event.source !== this.win ||
        event.origin !== this.win.location.origin ||
        !isSaleBatchMessage(event.data)
      )
        return;
      this.syncPage();
      const m = event.data;
      if (
        m.page !== this.page ||
        this.win.location.pathname !== "/market/sell/batch"
      )
        return;
      if (m.source === "batch") this.candidates = new Set(m.keys);
      if (m.revision <= this.revision) return;
      this.revision = m.revision;
      this.batch = new Set(m.keys.filter((key) => !this.removed.has(key)));
      this.changed();
    };
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(":disabled")) return;
      if (target.closest(".bsell-x")) {
        const row = target.closest(".bsell-row");
        const input = row?.querySelector<HTMLInputElement>("input");
        const sale = input && salesTarget(input, this.win.document);
        if (sale) {
          const key = saleSelectionKey(sale.context);
          // Run after the native handler. Filtering is never treated as removal.
          queueMicrotask(() => {
            if (row?.isConnected) return;
            this.removed.add(key);
            this.batch?.delete(key);
            this.changed();
          });
        }
      }
      if (target.closest('[data-testid="bsell-draft-clear-ok"]')) {
        queueMicrotask(() => {
          if (event.defaultPrevented) return;
          this.removed.clear();
          const keys = (
            new URL(this.win.location.href).searchParams.get("s") ?? ""
          )
            .split(",")
            .filter(Boolean);
          // A missed native read must not turn a filtered reset into a verdict
          // based only on the visible subset.
          this.batch = keys.every((key) => this.candidates.has(key))
            ? new Set(keys)
            : undefined;
          this.changed();
        });
      }
    };
    this.win.addEventListener("message", message);
    this.win.document.addEventListener("click", click, true);
    return () => {
      this.win.removeEventListener("message", message);
      this.win.document.removeEventListener("click", click, true);
    };
  }

  activePicker(): HTMLElement | undefined {
    const picker =
      this.win.document.querySelector<HTMLElement>(".mk-sell-sheet");
    return picker &&
      !picker.closest('[hidden],[inert],[aria-hidden="true"]') &&
      (!picker.matches("dialog") || picker.hasAttribute("open")) &&
      picker.querySelector('[data-testid="sell-many-go"]')
      ? picker
      : undefined;
  }

  pickerSelection(): Set<string> {
    this.syncPage();
    const picker = this.activePicker();
    if (picker !== this.picker) {
      this.picked.clear();
      this.picker = picker;
    }
    for (const button of picker?.querySelectorAll<HTMLElement>(
      ".pick-hit[aria-pressed]",
    ) ?? []) {
      const card = resolveCard(button, this.win.document);
      if (!card) continue;
      const key = saleSelectionKey(card);
      if (button.getAttribute("aria-pressed") === "true") this.picked.add(key);
      else this.picked.delete(key);
    }
    return this.picked;
  }

  batchSelection(
    targets: Map<HTMLInputElement, SalesTarget>,
  ): Set<string> | undefined {
    this.syncPage();
    const keys = [...targets.values()].map((target) =>
      saleSelectionKey(target.context),
    );
    if (this.win.location.pathname === "/market/sell") return new Set(keys);
    // Native .bsell-shown means the DOM contains only a filtered subset.
    if (
      this.win.document.querySelector(".bsell-list") &&
      !this.win.document.querySelector(".bsell-shown")
    )
      this.batch = new Set(keys);
    else if (this.batch) for (const key of keys) this.batch.add(key);
    return this.batch;
  }
}
