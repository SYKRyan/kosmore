// Entry point for the page-world relay. No exports, so the bundle adds no page globals.
import { installPageRelay } from "./page-relay-install";
import { BEFORE_PACK_CARD_FOCUS } from "./shared/page-relay";

installPageRelay();

// Native focus events run after the previous control has already lost focus.
// Give the content script a chance to retain focus when the summary updates.
const focusButton = HTMLButtonElement.prototype.focus;
Object.defineProperty(HTMLButtonElement.prototype, "focus", {
  configurable: true,
  writable: true,
  value(this: HTMLButtonElement, ...args: Parameters<typeof focusButton>) {
    if (
      location.pathname === "/packs/open" &&
      this.matches(".ko-summary .ko-grid > li > button.ko-grid-open, .ko-summary .ko-drop button.ko-drop-btn") &&
      !this.dispatchEvent(new Event(BEFORE_PACK_CARD_FOCUS, { bubbles: true, cancelable: true }))
    ) return;
    return focusButton.apply(this, args);
  },
});
