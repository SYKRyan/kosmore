import type { GameClient } from "../kosmora/client";
import { observePage } from "./page-changes";
import { NEXT_PACK } from "./pack-opening-hotkeys";
import { packStar } from "./pack-summary-status";
import actionCss from "./pack-summary-actions.css?inline";
import { el } from "./ui";

interface Recap {
  href: string;
  excluded: Set<string>;
  count?: number;
  account?: string;
  checkedTalent?: boolean;
  message?: string;
}

export class RemainingPacks {
  private recap?: Recap;
  private pending = false;
  private label = el("p", "ko-mega-progress");
  private button = el("button", "btn-gold btn-lg");
  private status = el("p", "ko-mega-progress");

  constructor(
    private client: GameClient,
    private enabled: () => boolean,
    private showCount: () => boolean,
  ) {
    this.label.setAttribute("data-kosmore-remaining-packs", "");
    this.button.append(packStar(), el("span", "", "Open 10 at once"));
    this.button.type = "button";
    this.button.setAttribute("data-kosmore-open-ten", "");
    this.status.setAttribute("data-kosmore-batch-status", "");
    this.status.setAttribute("role", "status");
    this.button.addEventListener("click", event => {
      if (event.isTrusted) this.activate();
    });
  }

  start() {
    document.head.append(el("style", "", actionCss));
    window.addEventListener("pageshow", event => {
      if (event.persisted) {
        this.pending = false;
        this.recap = undefined;
        this.refresh();
      }
    });
    this.client.onAccountChange(() => {
      this.recap = undefined;
      this.refresh();
    });
    observePage(() => this.refresh());
    this.refresh();
  }

  private nextButton() {
    if (!this.enabled() || location.pathname !== "/packs/open") return;
    const next = document.querySelector<HTMLButtonElement>(`.ko-summary ${NEXT_PACK}`);
    if (next && !next.closest('[hidden], [inert], [aria-hidden="true"]')) return next;
  }

  refresh() {
    const next = this.nextButton();
    const params = new URLSearchParams(location.search);
    const shown = params.get("id") || params.get("resume") || params.get("batch");
    if (!next || !shown || params.get("replay") === "1") {
      this.label.remove();
      this.button.remove();
      this.status.remove();
      if (this.recap?.href !== location.href) this.recap = undefined;
      return;
    }
    if (this.recap?.href !== location.href) {
      const excluded = new Set([shown, params.get("held") ?? ""].join(",").toLowerCase().split(","));
      const recap: Recap = this.recap = { href: location.href, excluded };
      void this.client.readyPackIds().then(ids => {
        if (this.recap !== recap || recap.count !== undefined) return;
        recap.count = ids.filter(id => !recap.excluded.has(id)).length;
        this.refresh();
      }).catch(() => {});
    }
    const recap = this.recap;
    if (recap.count !== undefined && this.showCount()) {
      const text = `${recap.count.toLocaleString()} ${recap.count === 1 ? "pack" : "packs"} ready`;
      if (this.label.textContent !== text) this.label.textContent = text;
      const stack = next.parentElement!;
      if (stack.lastElementChild !== this.label) stack.append(this.label);
    } else this.label.remove();

    if ((recap.count ?? 0) >= 10 && !recap.checkedTalent && !this.pending) {
      recap.checkedTalent = true;
      void this.client.batchOpenAccount().then(account => {
        if (this.recap !== recap) return;
        recap.account = account;
        this.refresh();
      }).catch(() => {});
    }
    if ((recap.count ?? 0) >= 10 && recap.account) {
      this.button.disabled = this.pending || next.disabled;
      this.button.ariaBusy = String(this.pending);
      if (next.nextElementSibling !== this.button) next.after(this.button);
    } else this.button.remove();
    if (recap.message) {
      if (this.status.textContent !== recap.message) this.status.textContent = recap.message;
      const anchor = this.button.isConnected ? this.button : next;
      if (anchor.nextElementSibling !== this.status) anchor.after(this.status);
    } else this.status.remove();
  }

  inventory(ids: string[]) {
    const recap = this.recap;
    if (!recap || recap.href !== location.href || this.pending) return;
    recap.count = ids.filter(id => !recap.excluded.has(id)).length;
    this.refresh();
  }

  activate() {
    const recap = this.recap;
    if (!recap?.account || this.pending || this.button.disabled || !this.button.isConnected ||
        !this.nextButton() || recap.href !== location.href) return;
    this.pending = true;
    recap.message = undefined;
    this.refresh();
    void this.open(recap, recap.account);
  }

  private async open(recap: Recap, expectedAccount: string) {
    let submitted = false;
    let navigating = false;
    try {
      const [account, ids] = await Promise.all([
        this.client.batchOpenAccount(true),
        this.client.readyPackIds(undefined, true),
      ]);
      const next = this.nextButton();
      if (this.recap !== recap || recap.href !== location.href || !next || next.disabled) return;
      const eligible = ids.filter(id => !recap.excluded.has(id));
      recap.count = eligible.length;
      if (!account || account !== expectedAccount) {
        recap.account = undefined;
        return;
      }
      if (eligible.length < 10) return;
      submitted = true;
      const held = (new URL(recap.href).searchParams.get("held") ?? "").toLowerCase()
        .split(",").filter(id => ids.includes(id));
      const href = await this.client.openPackBatch(eligible.slice(0, 10), account, held);
      if (this.recap === recap && recap.href === location.href) {
        location.assign(href);
        navigating = true;
      }
    } catch {
      if (this.recap !== recap || recap.href !== location.href) return;
      recap.count = undefined;
      if (!submitted) {
        recap.account = undefined;
        recap.checkedTalent = false;
      }
      recap.message = submitted
        ? "Could not confirm the batch opening. Checking remaining packs…"
        : "Could not verify the next batch. Checking remaining packs…";
      this.refresh();
      try {
        const ids = await this.client.readyPackIds(undefined, true);
        recap.count = ids.filter(id => !recap.excluded.has(id)).length;
        recap.message = submitted
          ? "Could not confirm the batch opening. Check your pack history before opening more."
          : "Could not verify the next batch. Try again when ready.";
      } catch {
        recap.message = "Pack inventory is unavailable. Refresh the page to check your packs.";
      }
    } finally {
      if (!navigating) {
        this.pending = false;
        this.refresh();
      }
    }
  }
}
