import type { Settings } from "../shared/types";
import { readSettings, saveSettings } from "../shared/settings";
import { button, el } from "./ui";
import { disclosureIcon, pinIcon } from "./icons";
import css from "./trade-interest.css?inline";

/** Notes share the trade's verified account and lifetime; never read another player here. */
export class TradeNotes {
  readonly badge = el("button", "notes-badge", "Notes");
  readonly inline = el("section", "trade-notes-inline");
  private popup?: HTMLDivElement;
  private openTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private suppressFocus = false;
  private events = new AbortController();
  constructor(
    private notes: string,
    private settings: Settings,
    private handle: string,
  ) {
    this.badge.type = "button";
    if (!settings.tradeNotesPinned) this.badge.append(disclosureIcon());
    this.badge.setAttribute("aria-label", `Notes for ${handle}`);
    this.badge.setAttribute("aria-haspopup", "dialog");
    this.badge.setAttribute("aria-expanded", "false");
    this.inline.hidden = !settings.tradeNotesPinned;
    this.inline.setAttribute("aria-label", `Notes for ${handle}`);
    this.inline.append(...this.content(true));
    const schedule = () => {
      this.cancelClose();
      clearTimeout(this.openTimer);
      if (!this.suppressFocus)
        this.openTimer = setTimeout(
          () => this.open(),
          settings.tradeNotesHoverDelayMs,
        );
    };
    this.badge.addEventListener("pointerenter", schedule);
    this.badge.addEventListener("focus", schedule);
    this.badge.addEventListener("pointerleave", () => this.laterHide());
    this.badge.addEventListener("blur", () => this.laterHide());
    this.badge.addEventListener("click", () => {
      clearTimeout(this.openTimer);
      if (settings.tradeNotesPinned)
        this.inline.scrollIntoView({ block: "nearest" });
      else this.open();
    });
    const options = { signal: this.events.signal };
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (
          !this.popup ||
          event
            .composedPath()
            .some((node) => node === this.popup || node === this.badge)
        )
          return;
        this.hide();
      },
      options,
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape" || (!this.popup && !this.openTimer)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.hide(true);
      },
      { ...options, capture: true },
    );
    window.addEventListener("resize", () => this.position(), options);
    window.addEventListener("scroll", () => this.position(), {
      ...options,
      capture: true,
      passive: true,
    });
  }
  private content(pinned: boolean): HTMLElement[] {
    const header = el("header", "notes-header"),
      pin = button("", () => void this.setPinned(!pinned), "notes-pin");
    pin.append(pinIcon());
    pin.title = pinned
      ? "Unpin trade notes"
      : "Pin trade notes below family badges";
    pin.setAttribute(
      "aria-label",
      pinned ? "Unpin trade notes" : "Pin trade notes",
    );
    pin.setAttribute("aria-pressed", String(pinned));
    header.append(el("strong", "", "Notes"), pin);
    if (!pinned) {
      const close = button("×", () => this.hide(true));
      close.setAttribute("aria-label", "Close trade notes");
      header.append(close);
    }
    return [header, el("div", "notes-text", this.notes)];
  }
  private open() {
    clearTimeout(this.openTimer);
    this.openTimer = undefined;
    if (
      this.disposed ||
      this.settings.tradeNotesPinned ||
      !this.badge.isConnected
    )
      return;
    this.cancelClose();
    if (!this.popup) {
      const popup = el("div");
      popup.dataset.kosmoreTrade = "notes";
      popup.popover = "manual";
      popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-label", `Notes for ${this.handle}`);
      const shadow = popup.attachShadow({ mode: "open" }),
        style = el("style");
      style.textContent = css;
      const content = el("div", "notes-popup");
      content.append(...this.content(false));
      shadow.append(style, content);
      popup.addEventListener("pointerenter", () => this.cancelClose());
      popup.addEventListener("pointerleave", () => this.laterHide());
      popup.addEventListener("focusin", () => this.cancelClose());
      popup.addEventListener("focusout", () => this.laterHide());
      document.body.append(popup);
      this.popup = popup;
      popup.showPopover();
    }
    this.badge.setAttribute("aria-expanded", "true");
    this.position();
  }
  private position() {
    if (!this.popup) return;
    const popup = this.popup,
      rect = this.badge.getBoundingClientRect();
    popup.style.width = `${Math.max(0, Math.min(this.settings.tradeNotesWidth, innerWidth - 24))}px`;
    popup.style.height = `${Math.max(0, Math.min(this.settings.tradeNotesHeight, innerHeight - 24))}px`;
    popup.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - popup.offsetWidth - 12))}px`;
    const top =
      rect.bottom + 8 + popup.offsetHeight <= innerHeight - 12
        ? rect.bottom + 8
        : rect.top - popup.offsetHeight - 8;
    popup.style.top = `${Math.max(12, Math.min(top, innerHeight - popup.offsetHeight - 12))}px`;
  }
  private cancelClose() {
    clearTimeout(this.closeTimer);
  }
  private laterHide() {
    clearTimeout(this.openTimer);
    this.openTimer = undefined;
    this.cancelClose();
    this.closeTimer = setTimeout(() => {
      if (
        !this.badge.matches(":hover,:focus") &&
        !this.popup?.matches(":hover") &&
        !this.popup?.shadowRoot?.activeElement
      )
        this.hide();
    }, this.settings.tradeNotesDismissDelayMs);
  }
  private hide(focus = false) {
    clearTimeout(this.openTimer);
    this.openTimer = undefined;
    this.cancelClose();
    this.popup?.remove();
    this.popup = undefined;
    this.badge.setAttribute("aria-expanded", "false");
    if (focus && this.badge.isConnected) {
      this.suppressFocus = true;
      this.badge.focus({ preventScroll: true });
      this.suppressFocus = false;
    }
  }
  private async setPinned(pinned: boolean) {
    const pins = [this.inline, this.popup?.shadowRoot].flatMap((root) => [
      ...(root?.querySelectorAll<HTMLButtonElement>(".notes-pin") ?? []),
    ]);
    pins.forEach((pin) => (pin.disabled = true));
    try {
      const settings = await readSettings();
      if (this.disposed) return;
      await saveSettings({ ...settings, tradeNotesPinned: pinned });
    } catch {
      const root = this.popup?.shadowRoot ?? this.inline;
      root.querySelector(".notes-error")?.remove();
      const error = el(
        "p",
        "notes-error",
        "Could not save the pin setting. Try again.",
      );
      error.setAttribute("role", "alert");
      root.append(error);
    } finally {
      pins.forEach((pin) => (pin.disabled = false));
    }
  }
  dispose() {
    this.disposed = true;
    this.events.abort();
    this.hide();
  }
}
