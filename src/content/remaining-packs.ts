import type { GameClient } from "../kosmora/client";
import { observePage } from "./page-changes";
import { NEXT_PACK } from "./pack-opening-hotkeys";
import { el } from "./ui";

export class RemainingPacks {
  private counts = new Map<string, number | undefined>();
  private label = el("p", "ko-mega-progress");

  constructor(
    private client: Pick<GameClient, "readyPackIds">,
    private enabled: () => boolean,
  ) {
    this.label.setAttribute("data-kosmore-remaining-packs", "");
    this.label.style.marginBlockStart = "-4px";
  }

  start() {
    observePage(() => this.refresh());
    this.refresh();
  }

  refresh() {
    const button =
      this.enabled() && location.pathname === "/packs/open"
        ? document.querySelector<HTMLElement>(`.ko-summary ${NEXT_PACK}`)
        : null;
    const params = new URLSearchParams(location.search);
    const shown =
      params.get("id") ?? params.get("resume") ?? params.get("batch");
    if (
      !button ||
      button.closest('[hidden], [aria-hidden="true"]') ||
      !shown ||
      params.get("replay") === "1"
    ) {
      this.label.remove();
      return;
    }
    const key = [shown, params.get("held")]
      .filter(Boolean)
      .join(",")
      .toLowerCase();
    const count = this.counts.get(key);
    if (count !== undefined) {
      const text = `${count.toLocaleString()} ${count === 1 ? "pack" : "packs"} ready`;
      if (this.label.textContent !== text) this.label.textContent = text;
      if (button.previousElementSibling !== this.label)
        button.before(this.label);
      return;
    }
    this.label.remove();
    if (this.counts.has(key)) return;
    this.counts.set(key, undefined);
    const excluded = new Set(key.split(","));
    void this.client
      .readyPackIds()
      .then((ids) => {
        this.counts.set(key, ids.filter((id) => !excluded.has(id)).length);
        this.refresh();
      })
      .catch(() => {
        // The count is optional. Do not retry on rerenders of the same summary.
      });
  }
}
