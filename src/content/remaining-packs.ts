import type { GameClient } from "../kosmora/client";
import { observePage } from "./page-changes";
import { NEXT_PACK } from "./pack-opening-hotkeys";
import { el } from "./ui";

export class RemainingPacks {
  private request?: {
    button: HTMLElement;
    key: string;
    abort: AbortController;
  };
  private label = el("p", "ko-mega-progress");

  constructor(
    private client: Pick<GameClient, "readyPackIds">,
    private enabled: () => boolean,
  ) {
    this.label.setAttribute("data-kosmore-remaining-packs", "");
    this.label.style.marginBlockStart = "-4px";
  }

  start() {
    observePage(() => {
      if (
        this.request ||
        (this.enabled() && location.pathname === "/packs/open")
      )
        this.refresh();
    });
    this.refresh();
  }

  refresh() {
    const button =
      this.enabled() && location.pathname === "/packs/open"
        ? document.querySelector<HTMLElement>(`.ko-summary ${NEXT_PACK}`)
        : null;
    if (!button) {
      this.request?.abort.abort();
      this.request = undefined;
      this.label.remove();
      return;
    }
    const params = new URLSearchParams(location.search);
    const shown =
      params.get("id") ?? params.get("resume") ?? params.get("batch");
    const key = shown
      ? [shown, params.get("held")].filter(Boolean).join(",").toLowerCase()
      : "";
    if (this.request?.button === button && this.request.key === key) return;
    this.request?.abort.abort();
    this.request = undefined;
    this.label.remove();
    if (!key || params.get("replay") === "1") return;
    const abort = new AbortController();
    this.request = { button, key, abort };
    const excluded = new Set(key.split(","));
    void this.client
      .readyPackIds(abort.signal)
      .then((ids) => {
        if (abort.signal.aborted || !button.isConnected) return;
        const count = ids.filter((id) => !excluded.has(id)).length;
        this.label.textContent = `${count.toLocaleString()} ${count === 1 ? "pack" : "packs"} ready`;
        button.before(this.label);
      })
      .catch(() => {
        // The native action remains usable if inventory is unavailable.
      });
  }
}
