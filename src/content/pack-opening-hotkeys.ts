import { contextKey, resolveCard } from "../kosmora/dom";
import {
  isTyping,
  PACK_OPENING,
  shortcutFromEvent,
  shortcutKey,
} from "../shared/hotkeys";
import type { CardContext, Settings } from "../shared/types";
import { observePage } from "./page-changes";

export const PACK_FOCUS = "data-kosmore-pack-focus";
const FOCUS_COLOR = "#f9e6b6";
const FOCUS_STAR = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path fill="${FOCUS_COLOR}" d="M6 0Q7 5 12 6Q7 7 6 12Q5 7 0 6Q5 5 6 0Z"/></svg>`,
)}`;
const MODAL = 'dialog[open], [aria-modal="true"]:not(dialog)';
const SUMMARY = ".ko-summary";
const FOUND_PACK_CONTINUE = "button.ko-drop-btn";
const FOUND_PACK_TYPES = ["ko-drop-rogue", "ko-drop-mega"] as const;
const GRID_CARD = ".ko-grid > li > button.ko-grid-open";
const GRID_MORE = ".ko-grid-more";
const REVEALED_CARD = ".ko-card.ko-beat-shown";
const REVEAL = ".ko-scene:not(.ko-summary-scene)";
const SKIP = "button.ko-skip:not(.ko-later):not(.ko-talents)";
const SKIP_WARNING = ".ko-skip-note, [data-testid='skip-note']";
const OPENING_PATH = "/packs/open";
export const NEXT_PACK = ".op-actions-stack > button.btn-gold.btn-lg";
const BACK_TO_PACKS = '.op-actions-stack > a.btn-gold.btn-lg[href="/packs"]';
const AUTO_SKIP_PREFIX = "kosmore.autoSkipOpening.";
const MODIFIER_KEYS = new Set([
  "Alt",
  "AltGraph",
  "CapsLock",
  "Control",
  "Fn",
  "FnLock",
  "Meta",
  "NumLock",
  "ScrollLock",
  "Shift",
  "Symbol",
  "SymbolLock",
]);

function visible(element: HTMLElement): boolean {
  return (
    !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === "visible"
  );
}
function available(element: HTMLElement): boolean {
  return (
    visible(element) && !element.matches(':disabled, [aria-disabled="true"]')
  );
}
function control(root: ParentNode, selector: string) {
  return [...root.querySelectorAll<HTMLElement>(selector)].find(available);
}
function modal() {
  const dialogs = [...document.querySelectorAll<HTMLElement>(MODAL)].filter(
    visible,
  );
  return (
    dialogs.filter((dialog) => dialog.matches(":modal")).at(-1) ??
    dialogs.at(-1)
  );
}
function gridCards(summary: HTMLElement): HTMLElement[] {
  return [...summary.querySelectorAll<HTMLElement>(GRID_CARD)].filter(
    available,
  );
}

export class PackOpeningHotkeys {
  private url = location.href;
  private focused?: HTMLElement;
  private reveal?: { scene: HTMLElement; previous?: string };
  private batch?: {
    summary: HTMLElement;
    index: number | "last";
    count: number;
    timer: ReturnType<typeof setTimeout>;
  };
  private handledKey?: string;
  private summaryFocus?: {
    summary: HTMLElement;
    pending: boolean;
    card?: HTMLElement;
  };
  private skipAttempts = new Set<string>();
  private autoDismissedDrops = new WeakMap<HTMLElement, Set<string>>();
  private nextPackSkip?: {
    sourceId: string;
    targetId?: string;
    expires: number;
  };

  constructor(
    private settings: () => Settings,
    private showTooltip: (context: CardContext) => void,
    private closeTooltip: () => void,
    private beforeActivate: () => void,
    private insideTooltip: (element: Element) => boolean,
    private pinnedTooltipVisible: () => boolean,
  ) {}

  start() {
    const style = document.createElement("style");
    style.id = "kosmore-pack-hotkeys-style";
    const focusedSummaryButton = `button.ko-grid-open:is([${PACK_FOCUS}], :focus-visible)`;
    const focusedSummaryFace = `${SUMMARY} .ko-grid > li:has(> ${focusedSummaryButton}) .kc-article`;
    const summaryButtonWithFace = `${SUMMARY} .ko-grid > li:has(.kc-article) > ${focusedSummaryButton}`;
    const outlinedCard = `[${PACK_FOCUS}]:not(${summaryButtonWithFace}), ${focusedSummaryFace}`;
    style.textContent = `
      [${PACK_FOCUS}],
      ${focusedSummaryFace} {
        outline: 3px solid ${FOCUS_COLOR} !important;
        outline-offset: 3px;
      }
      ${summaryButtonWithFace} {
        outline: none !important;
      }
      /* Let Kosmora's card positioning take precedence. */
      :where(${outlinedCard}) {
        position: relative;
      }
      :is(${outlinedCard})::after {
        content: "";
        position: absolute;
        z-index: 1;
        left: 50%;
        top: -4.5px;
        transform: translate(-50%, -50%);
        box-sizing: border-box;
        width: 18px;
        height: 18px;
        border: 2px solid ${FOCUS_COLOR};
        border-radius: 50%;
        background: #211831 url("${FOCUS_STAR}") center / 12px 12px no-repeat;
        pointer-events: none;
      }
    `;
    document.head.append(style);
    // A found-pack prompt gets first refusal before navigation shortcuts.
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("click", this.onPackClick, true);
    document.addEventListener("focusin", this.onFocusIn, true);
    document.addEventListener(
      "focusout",
      (event) => {
        const card = this.focused;
        if (!card || this.keepsFocus(event.relatedTarget)) return;
        // During a native focus transfer, activeElement can still be the body
        // when the focusout event and its microtasks run.
        requestAnimationFrame(() => {
          if (this.focused === card && !this.hasFocus()) this.clearFocus();
        });
      },
      true,
    );
    window.addEventListener("pagehide", () => {
      this.nextPackSkip = undefined;
      this.summaryFocus = undefined;
      this.reset();
    });
    observePage(() => this.pageChanged());
    this.focusSummary();
    this.dismissFoundPackAutomatically();
  }

  reset() {
    this.url = location.href;
    this.reveal = undefined;
    this.cancelBatch();
    this.clearFocus();
  }

  restoreCardFocus() {
    if (this.focused && available(this.focused))
      this.focused.focus({ preventScroll: true });
  }

  keepFocusOnRecap(previous: URL) {
    const recap = new URL(location.href);
    const openingId = this.openingId(previous.searchParams);
    if (
      !this.focused?.isConnected ||
      !this.focused.closest(SUMMARY) ||
      previous.pathname !== OPENING_PATH ||
      recap.pathname !== OPENING_PATH ||
      previous.searchParams.get("recap") === "1" ||
      recap.searchParams.get("recap") !== "1" ||
      (openingId && openingId !== this.openingId(recap.searchParams))
    )
      return false;
    this.url = recap.href;
    return true;
  }

  private onFocusIn = (event: FocusEvent) => {
    if (event.target instanceof Element && !this.keepsFocus(event.target)) {
      this.deferFocusForDrop(event.target);
      this.cancelBatch();
      this.reveal = undefined;
      this.clearFocus();
    }
  };

  private onKeyDown = (event: KeyboardEvent) => {
    const settings = this.settings();
    if (
      location.pathname !== OPENING_PATH ||
      !settings.packOpeningHotkeysEnabled ||
      event.target === window ||
      event.defaultPrevented ||
      event.isComposing ||
      isTyping(event)
    )
      return;
    if (event.repeat) {
      if (this.handledKey === event.code) this.consume(event);
      return;
    }
    this.handledKey = undefined;
    const shortcut = shortcutFromEvent(event, true);
    const key = shortcut && shortcutKey(shortcut);
    const action =
      key &&
      PACK_OPENING.find(({ id }) => {
        const binding = settings.packOpeningHotkeys[id];
        return binding && shortcutKey(binding) === key;
      })?.id;
    if (!action && !settings.anyKeyDismissesFoundPack) return;

    const dialog = modal();
    if (dialog) {
      if (
        dialog.matches(`${SUMMARY} .ko-drop`) &&
        (settings.anyKeyDismissesFoundPack
          ? !MODIFIER_KEYS.has(event.key)
          : action === "dismissFoundPack")
      )
        this.activate(event, control(dialog, FOUND_PACK_CONTINUE));
      return;
    }
    if (!action) return;
    if (this.url !== location.href) this.reset();
    this.cancelBatch();

    const summary = control(document, SUMMARY);
    if (action === "seeCard") {
      const card =
        this.focused && this.hasFocus() ? this.focused : document.activeElement;
      if (
        !(card instanceof HTMLElement) ||
        !available(card) ||
        !card.matches(`${SUMMARY} ${GRID_CARD}, ${REVEAL} ${REVEALED_CARD}`)
      )
        return;
      const context = resolveCard(card);
      if (!context) return;
      const href = `/card/${context.subjectId}`;
      const link = [
        ...context.anchor.querySelectorAll<HTMLAnchorElement>("a[href]"),
      ].find(
        (anchor) =>
          anchor.origin === location.origin &&
          anchor.pathname === href &&
          available(anchor),
      );
      if (link) {
        this.activate(event, link);
      } else {
        this.consume(event);
        this.beforeActivate();
        location.assign(href);
      }
      return;
    }
    if (summary) {
      if (action === "nextPack")
        this.activate(
          event,
          control(summary, NEXT_PACK) ?? control(summary, BACK_TO_PACKS),
        );
      else if (action === "share")
        this.activate(event, control(summary, ".op-actions button.op-share"));
      else if (action === "home")
        this.activate(event, control(summary, '.op-actions a[href="/home"]'));
      else if (
        action === "focusFirstCard" ||
        action === "focusLastCard" ||
        action === "nextCard" ||
        action === "previousCard"
      ) {
        const cards = gridCards(summary);
        const current = cards.indexOf(
          this.focused ?? (document.activeElement as HTMLElement),
        );
        const index =
          action === "focusFirstCard"
            ? 0
            : action === "focusLastCard"
              ? "last"
              : action === "nextCard"
                ? current + 1
                : current < 0
                  ? "last"
                  : Math.max(0, current - 1);
        if (cards.length) {
          this.consume(event);
          this.focusGridCard(summary, cards, index);
        }
      }
      return;
    }
    const scene = control(document, REVEAL);
    if (!scene) return;
    if (action === "skipOpening") this.activate(event, control(scene, SKIP));
    else if (action === "later")
      this.activate(event, control(scene, "button.ko-skip.ko-later"));
    else if (
      action === "nextCard" &&
      control(scene, ".ko-pack-ready, .ko-table:not(.ko-table-ahead)")
    ) {
      this.consume(event);
      const shown = control(scene, REVEALED_CARD);
      const context = shown && resolveCard(shown);
      this.clearFocus();
      this.beforeActivate();
      this.reveal = {
        scene,
        previous: context ? contextKey(context) : undefined,
      };
      // The live reveal control uses pointer gestures and a window keyboard
      // handler. Dispatch its native key directly to that handler's target.
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          code: "ArrowRight",
          cancelable: true,
        }),
      );
    }
  };

  private onPackClick = (event: MouseEvent) => {
    if (
      location.pathname !== OPENING_PATH ||
      !(event.target instanceof Element)
    )
      return;
    const openingId = this.openingId(new URLSearchParams(location.search));
    if (openingId && event.target.closest(SKIP)?.closest(REVEAL))
      this.recordSkip(openingId);
    if (event.target.closest(`${SUMMARY} ${BACK_TO_PACKS}`))
      this.nextPackSkip = undefined;
    const next = event.target.closest<HTMLElement>(`${SUMMARY} ${NEXT_PACK}`);
    const { packOpeningHotkeysEnabled, autoSkipOpening } = this.settings();
    // Both mouse and the Next Pack hotkey activate the same native button.
    if (
      next &&
      available(next) &&
      !event.defaultPrevented &&
      packOpeningHotkeysEnabled &&
      autoSkipOpening &&
      !modal()
    ) {
      this.nextPackSkip = { sourceId: openingId, expires: Date.now() + 15_000 };
    }
  };

  private openingId(params: URLSearchParams) {
    return (params.get("id") ?? params.get("resume") ?? "").toLowerCase();
  }

  private recordSkip(openingId: string) {
    if (this.skipAttempts.has(openingId)) return;
    this.skipAttempts.add(openingId);
    // Keep the attempt one-shot across reloads in this tab.
    try {
      sessionStorage.setItem(AUTO_SKIP_PREFIX + openingId, "1");
    } catch {
      // The in-memory guard still covers this document.
    }
  }

  private autoSkip() {
    const pending = this.nextPackSkip;
    if (!pending) return;
    const { packOpeningHotkeysEnabled, autoSkipOpening } = this.settings();
    if (
      location.pathname !== OPENING_PATH ||
      !packOpeningHotkeysEnabled ||
      !autoSkipOpening
    ) {
      this.nextPackSkip = undefined;
      return;
    }
    const params = new URLSearchParams(location.search);
    const openingId = this.openingId(params);
    if (!pending.targetId) {
      if (Date.now() >= pending.expires) {
        this.nextPackSkip = undefined;
        return;
      }
      if (!params.has("id") || !openingId || openingId === pending.sourceId)
        return;
      pending.targetId = openingId;
    }
    if (
      openingId !== pending.targetId ||
      params.get("replay") === "1" ||
      params.get("recap") === "1" ||
      this.skipAttempts.has(openingId)
    ) {
      this.nextPackSkip = undefined;
      return;
    }
    try {
      if (sessionStorage.getItem(AUTO_SKIP_PREFIX + openingId)) {
        this.nextPackSkip = undefined;
        return;
      }
    } catch {
      // Storage may be unavailable. Fall back to the in-memory guard.
    }
    const scene = control(document, REVEAL);
    if (!scene) return;
    if (
      scene.querySelector(SKIP_WARNING) ||
      modal() ||
      control(scene, ".ko-pack-burst, .ko-table:not(.ko-table-ahead)")
    ) {
      this.nextPackSkip = undefined;
      return;
    }
    if (!control(scene, ".ko-pack-intro, .ko-pack-ready")) return;
    const skip = control(scene, SKIP);
    if (!skip) return;
    // Record before clicking. Kosmora may show a warning and keep this scene open.
    this.nextPackSkip = undefined;
    // Kosmora's native Skip handler only protects rare openings with reveal hints on.
    if (scene.dataset.hints !== "on") return;
    this.recordSkip(openingId);
    this.beforeActivate();
    skip.click();
  }

  private consume(event: KeyboardEvent) {
    this.handledKey = event.code;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  dismissFoundPackAutomatically() {
    const { packOpeningHotkeysEnabled, autoDismissFoundPack } = this.settings();
    if (
      location.pathname !== OPENING_PATH ||
      !packOpeningHotkeysEnabled ||
      !autoDismissFoundPack
    )
      return;
    const dialog = modal();
    if (!dialog?.matches(".ko-drop")) return;
    const summary = dialog.closest<HTMLElement>(SUMMARY);
    const kind = FOUND_PACK_TYPES.find((type) =>
      dialog.classList.contains(type),
    );
    const button = control(dialog, FOUND_PACK_CONTINUE);
    if (!summary || !kind || !button) return;
    const dismissed = this.autoDismissedDrops.get(summary) ?? new Set<string>();
    if (dismissed.has(kind)) return;
    // Kosmora can reuse the same dialog element for the next reward.
    dismissed.add(kind);
    this.autoDismissedDrops.set(summary, dismissed);
    this.deferFocusForDrop(dialog);
    this.activate(null, button);
  }

  private activate(event: KeyboardEvent | null, target?: HTMLElement) {
    if (!target) return;
    if (event) this.consume(event);
    this.reset();
    this.beforeActivate();
    target.click();
  }

  private hasFocus() {
    return this.keepsFocus(document.activeElement);
  }

  private keepsFocus(target: EventTarget | null) {
    return (
      target instanceof Element &&
      (target === this.focused || this.insideTooltip(target))
    );
  }

  private clearFocus() {
    if (!this.focused) return;
    this.focused.removeAttribute(PACK_FOCUS);
    this.focused = undefined;
    this.closeTooltip();
  }

  private focusCard(card: HTMLElement, context = resolveCard(card)) {
    if (this.focused !== card) this.focused?.removeAttribute(PACK_FOCUS);
    this.focused = card;
    card.setAttribute(PACK_FOCUS, "");
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (context) this.showTooltip(context);
    else this.closeTooltip();
  }

  private deferFocusForDrop(target: Element) {
    const focus = this.summaryFocus;
    if (
      focus?.card &&
      focus.card === this.focused &&
      target.closest(".ko-drop")?.closest(SUMMARY) === focus.summary
    ) {
      focus.pending = true;
    }
  }

  private focusSummary() {
    const summary =
      location.pathname === OPENING_PATH
        ? document.querySelector<HTMLElement>(SUMMARY)
        : null;
    if (!summary) {
      this.summaryFocus = undefined;
      return;
    }
    const pinned = this.pinnedTooltipVisible();
    if (summary !== this.summaryFocus?.summary)
      this.summaryFocus = { summary, pending: pinned };
    const focus = this.summaryFocus;
    if (!focus || !pinned) {
      if (focus) focus.pending = false;
      return;
    }
    if (!focus.pending && focus.card !== this.focused) return;
    const dialog = modal();
    if (dialog) {
      this.deferFocusForDrop(dialog);
      return;
    }
    if (!focus.pending) return;
    const card = control(summary, GRID_CARD);
    const context = card && resolveCard(card);
    if (!card || !context) return;
    focus.card = card;
    focus.pending = false;
    this.focusCard(card, context);
  }

  private cancelBatch() {
    if (this.batch) clearTimeout(this.batch.timer);
    this.batch = undefined;
  }

  private focusGridCard(
    summary: HTMLElement,
    cards: HTMLElement[],
    index: number | "last",
  ) {
    // Kosmora's intersection marker is intentionally hidden from assistive technology.
    const sentinel = summary.querySelector<HTMLElement>(GRID_MORE);
    if ((index === "last" || index >= cards.length) && sentinel) {
      this.batch = {
        summary,
        index,
        count: cards.length,
        timer: setTimeout(() => {
          this.cancelBatch();
          this.focused?.scrollIntoView({ block: "nearest" });
        }, 2000),
      };
      sentinel.scrollIntoView({ block: "nearest" });
      return;
    }
    const card =
      cards[
        index === "last" ? cards.length - 1 : Math.min(index, cards.length - 1)
      ];
    if (card) this.focusCard(card);
  }

  private pageChanged() {
    this.autoSkip();
    this.focusSummary();
    this.dismissFoundPackAutomatically();
    if (location.pathname !== OPENING_PATH && this.url === location.href)
      return;
    if (!this.focused && !this.reveal && !this.batch) return;
    if (this.url !== location.href || modal()) {
      this.reset();
      return;
    }
    if (this.focused && (!available(this.focused) || !this.hasFocus()))
      this.clearFocus();
    if (this.reveal) {
      const { scene, previous } = this.reveal;
      const shown = control(scene, REVEALED_CARD);
      const context = shown && resolveCard(shown);
      if (!scene.isConnected) this.reveal = undefined;
      else if (shown && context && contextKey(context) !== previous) {
        this.reveal = undefined;
        this.focusCard(shown);
      }
    }
    if (this.batch) {
      const { summary, index, count } = this.batch;
      const cards = gridCards(summary);
      if (!available(summary)) this.cancelBatch();
      else if (cards.length !== count || !summary.querySelector(GRID_MORE)) {
        this.cancelBatch();
        this.focusGridCard(summary, cards, index);
      }
    }
  }
}
