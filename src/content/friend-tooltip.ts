import { headerIcon, pinIcon } from "./icons";
import css from "./friend-tooltip.css?inline";
import headerCss from "./tooltip-header-buttons.css?inline";
import { FRIEND_TOOLTIP_ID, topDialog } from "../kosmora/dom";
import {
  matchFriends,
  readFriendPreferences,
  type TradeMatch,
} from "../shared/trade-matches";
import type { FriendReminder } from "../shared/friend-reminders";
import { defaults } from "../shared/settings";
import { messageOf, type KosmoraClient, type Settings } from "../shared/types";
import {
  parsePopupState,
  resizedBounds,
  type PopupBounds,
  type PopupLayoutChange,
  type PopupPosition,
  type PopupState,
} from "../shared/popup-layout";
import { request } from "../shared/messages";
import { button, el } from "./ui";
import { enableMarketLink as enablePageLink } from "./market-links";
import { observePage } from "./page-changes";

interface FriendDetails extends TradeMatch {
  reminder: FriendReminder;
}
interface Source {
  anchor: HTMLElement;
  subjectId: string;
  owner?: HTMLElement;
}
const LIMITS = { minWidth: 240, minHeight: 160 };
const familyKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** A single account-scoped companion popup for the card hover tooltip. */
export class FriendTooltip {
  private settings = defaults();
  private state: PopupState = { pinned: false, position: null };
  private source?: Source;
  private pendingSource?: Source;
  private view?: FriendTooltipView;
  private abort?: AbortController;
  private openTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private reloadTimer?: ReturnType<typeof setTimeout>;
  private version = 0;
  private layoutChanged = false;
  private suppressFocus = false;
  private url = location.href;
  private ready: Promise<void> = Promise.resolve();
  constructor(
    private client: KosmoraClient,
    private closed: () => void,
  ) {
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape" || (!this.view && !this.pendingSource))
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.dismiss(true);
      },
      true,
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.view || this.view.pinned) return;
        if (
          !event
            .composedPath()
            .some(
              (node) =>
                node === this.view?.host ||
                node === this.source?.anchor ||
                (node instanceof Element && node.matches(".friend-trigger")),
            )
        )
          this.hide();
      },
      true,
    );
    for (const event of ["popstate", "hashchange", "pagehide"])
      window.addEventListener(event, () => this.reset());
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    navigation?.addEventListener("navigatesuccess", () => this.checkPage());
    window.addEventListener("scroll", () => this.view?.position(), {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", () => this.view?.position());
    observePage(() => this.checkPage());
    chrome.storage.onChanged.addListener((changes, area) => {
      if (
        area !== "local" ||
        !this.source ||
        !this.view ||
        !Object.keys(changes).some((key) => key.startsWith("kosmore.friend."))
      )
        return;
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => {
        if (this.source) void this.load(this.source);
      }, 0);
    });
  }
  restore() {
    this.ready = request<PopupState>({ op: "friendPopupState" })
      .then((raw) => {
        if (this.layoutChanged) return;
        this.state = parsePopupState(raw);
        if (this.enabled() && this.state.pinned && !this.view)
          this.createView();
      })
      .catch(() => {});
    return this.ready;
  }
  setSettings(settings: Settings) {
    this.settings = settings;
    if (
      !settings.friendTooltipEnabled ||
      !settings.cardOverlaysEnabled ||
      !settings.showFriendInterestOverlay
    ) {
      this.hide();
      return;
    }
    this.view?.setSettings(settings);
    if (this.state.pinned && !this.view) this.createView();
  }
  bind(anchor: HTMLElement, subjectId: string, owner?: HTMLElement) {
    const source = { anchor, subjectId, owner };
    anchor.classList.add("friend-trigger");
    anchor.setAttribute("aria-haspopup", "dialog");
    anchor.setAttribute("aria-controls", FRIEND_TOOLTIP_ID);
    anchor.setAttribute("aria-expanded", "false");
    anchor.removeAttribute("title");
    // Progressive badge renders can replace the trigger while this popup is open.
    // Keep the active source object so its pending read and hover handoff survive.
    for (const active of [this.source, this.pendingSource]) {
      if (
        active &&
        active.subjectId === subjectId &&
        active.owner === owner &&
        active.anchor !== anchor
      ) {
        active.anchor = anchor;
        if (active === this.source && this.view) {
          this.view.anchor = anchor;
          anchor.setAttribute("aria-expanded", "true");
          this.view.position();
        }
      }
    }
    anchor.addEventListener("pointerenter", () => this.schedule(source));
    anchor.addEventListener("pointerleave", () => this.laterHide());
    anchor.addEventListener("focus", () => {
      if (!this.suppressFocus) this.schedule(source);
    });
    anchor.addEventListener("blur", () => this.laterHide());
    for (const type of [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "dblclick",
      "auxclick",
    ])
      anchor.addEventListener(type, (event) => event.stopPropagation());
    for (const type of ["keydown", "keyup"])
      anchor.addEventListener(type, (event) => {
        if (["Enter", " "].includes((event as KeyboardEvent).key))
          event.stopPropagation();
      });
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(this.openTimer);
      void this.open(source);
    });
  }
  contains(target: Element) {
    return (
      !!this.view &&
      (target === this.view.host || this.view.host.contains(target))
    );
  }
  keepsOpen(owner?: HTMLElement) {
    return (
      !!owner &&
      this.source?.owner === owner &&
      !!this.view &&
      !this.view.pinned
    );
  }
  ownerDisposed(owner: HTMLElement) {
    if (this.source?.owner === owner && !this.view?.pinned) this.hide();
  }
  reset() {
    this.url = location.href;
    this.hide();
    if (
      this.state.pinned &&
      this.settings.friendTooltipEnabled &&
      this.settings.cardOverlaysEnabled &&
      this.settings.showFriendInterestOverlay
    )
      this.createView();
  }
  private enabled() {
    return (
      this.settings.friendTooltipEnabled &&
      this.settings.cardOverlaysEnabled &&
      this.settings.showFriendInterestOverlay
    );
  }
  private schedule(source: Source) {
    if (!this.enabled()) return;
    this.cancelClose();
    clearTimeout(this.openTimer);
    this.pendingSource = undefined;
    if (this.source?.anchor === source.anchor && this.view) return;
    this.pendingSource = source;
    this.openTimer = setTimeout(() => {
      void this.open(source);
    }, this.settings.friendHoverDelayMs);
  }
  private async open(source: Source) {
    this.pendingSource = source;
    await this.ready;
    if (
      this.pendingSource !== source ||
      !this.enabled() ||
      !source.anchor.isConnected
    ) {
      if (this.pendingSource === source) this.pendingSource = undefined;
      return;
    }
    this.pendingSource = undefined;
    this.cancelClose();
    if (this.source?.anchor === source.anchor && this.view) return;
    if (this.source) this.source.anchor.setAttribute("aria-expanded", "false");
    const changedCard = this.source?.subjectId !== source.subjectId;
    this.source = source;
    source.anchor.setAttribute("aria-expanded", "true");
    const view = this.view ?? this.createView();
    view.anchor = source.anchor;
    if (changedCard) view.clear();
    view.position();
    await this.load(source);
  }
  private async load(source: Source, fresh = false) {
    this.abort?.abort();
    const abort = new AbortController(),
      version = ++this.version,
      view = this.view;
    this.abort = abort;
    if (!view) return;
    view.loading();
    const valid = () =>
      !abort.signal.aborted &&
      version === this.version &&
      this.view === view &&
      this.source === source;
    try {
      const account = await this.client.account(abort.signal);
      if (!valid()) return;
      const [card, friends] = await Promise.all([
        this.client.insights(source.subjectId, abort.signal, fresh),
        this.client.friends(abort.signal, fresh),
      ]);
      if (!valid()) return;
      if (card.families === null)
        throw new Error(
          "This card's families are unavailable. Refresh to try again.",
        );
      const { reminders, unreadable } = await readFriendPreferences(
        account.key,
        friends,
      );
      if (!valid()) return;
      const matches = matchFriends(card.families, friends, reminders).map(
        (match) => ({ ...match, reminder: reminders.get(match.friend.key)! }),
      );
      view.setData(matches, unreadable);
    } catch (error) {
      if (valid()) view.failed(error);
    }
  }
  private createView() {
    const view = new FriendTooltipView(
      this.settings,
      this.state,
      () => this.dismiss(true),
      (change) => this.saveLayout(change),
      () => this.cancelClose(),
      () => this.laterHide(),
      () => {
        if (this.source) void this.load(this.source, true);
      },
    );
    this.view = view;
    return view;
  }
  private saveLayout(change: PopupLayoutChange) {
    this.layoutChanged = true;
    this.state = {
      pinned: change.pinned ?? this.state.pinned,
      position: change.position ?? this.state.position,
    };
    this.settings = {
      ...this.settings,
      friendTooltipPosition:
        change.position ?? this.settings.friendTooltipPosition,
      friendTooltipWidth: change.width ?? this.settings.friendTooltipWidth,
      friendTooltipHeight: change.height ?? this.settings.friendTooltipHeight,
    };
    void request<PopupState>({ op: "friendPopupLayout", change }).catch(
      (error) => this.view?.layoutFailed(error),
    );
    if (change.pinned === false && !this.source) this.hide();
    else if (!this.state.pinned) this.laterHide();
  }
  private cancelClose() {
    clearTimeout(this.closeTimer);
  }
  private laterHide() {
    clearTimeout(this.openTimer);
    this.pendingSource = undefined;
    this.cancelClose();
    if (this.view?.pinned) return;
    this.closeTimer = setTimeout(() => {
      if (
        !this.view?.pinned &&
        !this.view?.host.matches(":hover") &&
        !this.view?.shadow.activeElement &&
        !this.source?.anchor.matches(":hover,:focus")
      )
        this.hide();
    }, this.settings.friendDismissDelayMs);
  }
  private dismiss(focus: boolean) {
    const anchor = this.source?.anchor;
    this.state.pinned = false;
    this.layoutChanged = true;
    void request<PopupState>({
      op: "friendPopupLayout",
      change: { pinned: false },
    }).catch(() => {});
    this.hide();
    if (focus && anchor?.isConnected) {
      this.suppressFocus = true;
      anchor.focus({ preventScroll: true });
      queueMicrotask(() => {
        this.suppressFocus = false;
      });
    }
  }
  private hide() {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    clearTimeout(this.reloadTimer);
    this.pendingSource = undefined;
    this.abort?.abort();
    this.abort = undefined;
    this.version++;
    this.source?.anchor.setAttribute("aria-expanded", "false");
    this.source = undefined;
    this.view?.dispose();
    this.view = undefined;
    this.closed();
  }
  private checkPage() {
    if (this.url !== location.href) {
      this.reset();
      return;
    }
    if (!this.view) return;
    if (
      this.source &&
      (!this.source.anchor.isConnected ||
        !this.source.anchor.getClientRects().length) &&
      !this.view.pinned
    ) {
      this.hide();
      return;
    }
    this.view.mount();
  }
}

class FriendTooltipView {
  readonly host = el("div");
  readonly shadow = this.host.attachShadow({ mode: "open" });
  anchor?: HTMLElement;
  pinned: boolean;
  private placement: PopupPosition | null;
  private body = el("div", "body");
  private status = el("p", "status");
  private privacy = el("p", "privacy");
  private list = el("div", "friends");
  private pin = button("", () => this.togglePin(), "icon pin-button");
  private data: FriendDetails[] = [];
  private expanded?: string;
  private observer: ResizeObserver;
  private frame = 0;
  private disposed = false;
  private resizeBounds?: PopupBounds;
  private finishInteraction?: () => void;
  constructor(
    private settings: Settings,
    state: PopupState,
    close: () => void,
    private changed: (change: PopupLayoutChange) => void,
    entered: () => void,
    left: () => void,
    refresh: () => void,
  ) {
    this.pinned = state.pinned;
    this.placement = state.position ?? settings.friendTooltipPosition;
    this.host.id = FRIEND_TOOLTIP_ID;
    this.host.popover = "manual";
    this.host.setAttribute("role", "dialog");
    this.host.setAttribute("aria-label", "Interested friends");
    const style = el("style");
    style.textContent = css + headerCss;
    const header = el("header", "top"),
      reload = button("", refresh, "icon refresh-button"),
      dismiss = button("", close, "icon close");
    reload.append(headerIcon("refresh"));
    dismiss.append(headerIcon("close"));
    reload.setAttribute("aria-label", "Refresh friends");
    reload.title = "Refresh friends";
    dismiss.setAttribute("aria-label", "Close friend tooltip");
    dismiss.title = "Close friend tooltip";
    header.append(
      el("h2", "", "Interested friends"),
      reload,
      this.pin,
      dismiss,
    );
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.body.append(this.privacy, this.status, this.list);
    this.shadow.append(style, header, this.body);
    this.host.addEventListener("pointerenter", entered);
    this.host.addEventListener("pointerleave", left);
    this.host.addEventListener("focusin", entered);
    this.host.addEventListener("focusout", left);
    for (const event of [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "auxclick",
      "keydown",
      "keyup",
      "wheel",
    ])
      this.host.addEventListener(event, (e) => e.stopPropagation());
    this.renderPin();
    this.clear();
    this.applySize();
    this.enableDrag(header);
    this.enableResize();
    this.observer = new ResizeObserver(() => this.position());
    this.observer.observe(this.host);
    this.mount();
  }
  clear() {
    this.expanded = undefined;
    this.data = [];
    this.list.replaceChildren();
    this.privacy.textContent = "";
    this.status.className = "status";
    this.status.textContent = "Hover the friend icon in a card tooltip.";
  }
  loading() {
    this.list.replaceChildren();
    this.privacy.textContent = "";
    this.status.className = "status";
    this.status.textContent = "Loading matching friends…";
  }
  failed(error: unknown) {
    this.data = [];
    this.list.replaceChildren();
    this.privacy.textContent = "";
    this.status.className = "status error";
    this.status.textContent = messageOf(error);
  }
  layoutFailed(error: unknown) {
    this.status.className = "status error";
    this.status.textContent = `Could not save friend tooltip layout. ${messageOf(error)}`;
  }
  setData(data: FriendDetails[], unreadable: number) {
    this.data = data;
    this.list.replaceChildren();
    if (!data.some((item) => item.friend.key === this.expanded))
      this.expanded = undefined;
    this.privacy.textContent = `${data.length} ${data.length === 1 ? "friend matches" : "friends match"} this card`;
    this.status.className = "status";
    this.status.textContent = unreadable
      ? "Some saved friend preferences could not be read. Matches may be incomplete."
      : data.length
        ? ""
        : "No matching friends for this card.";
    for (const detail of data) {
      const row = el("section", "friend-row");
      row.dataset.friend = detail.friend.key;
      const summary = button(
        "",
        () =>
          this.expand(
            this.expanded === detail.friend.key ? undefined : detail.friend.key,
          ),
        "friend-summary",
      );
      const avatar = el(
        "span",
        "friend-avatar",
        detail.friend.handle.slice(0, 2).toUpperCase(),
      );
      avatar.setAttribute("aria-hidden", "true");
      const label = el("span", "friend-label"),
        chevron = el("span", "chevron", "▾");
      chevron.setAttribute("aria-hidden", "true");
      label.append(
        el("b", "friend-name", detail.friend.handle),
        el(
          "span",
          "match-count",
          `${detail.families.length} matching ${detail.families.length === 1 ? "family" : "families"}`,
        ),
      );
      summary.append(avatar, label, chevron);
      summary.setAttribute("aria-label", detail.friend.handle);
      summary.setAttribute(
        "aria-controls",
        `friend-details-${detail.friend.key}`,
      );
      const content = el("div", "friend-details");
      content.id = `friend-details-${detail.friend.key}`;
      content.setAttribute("role", "region");
      content.setAttribute("aria-label", `${detail.friend.handle} details`);
      row.append(summary, content);
      this.list.append(row);
    }
    this.expand(this.expanded);
  }
  private expand(key?: string) {
    if (this.data.length === 1) key = this.data[0].friend.key;
    this.expanded = key;
    for (const row of this.list.children) {
      const open = (row as HTMLElement).dataset.friend === key,
        summary = row.querySelector<HTMLButtonElement>(".friend-summary")!,
        content = row.querySelector<HTMLElement>(".friend-details")!;
      summary.setAttribute("aria-expanded", String(open));
      row.toggleAttribute("data-expanded", open);
      content.hidden = !open;
      content.replaceChildren();
      if (!open) continue;
      const detail = this.data.find((item) => item.friend.key === key)!;
      const families = el("div", "families");
      families.setAttribute("aria-label", "Saved families");
      const matched = new Set(detail.families.map((f) => familyKey(f.name)));
      for (const family of detail.reminder.families)
        families.append(
          el(
            "span",
            `family-badge${matched.has(familyKey(family)) ? " matched" : ""}`,
            family,
          ),
        );
      const familySection = el("section", "detail-section");
      familySection.append(
        el("h3", "detail-title", "Family preferences"),
        families,
      );
      const noteSection = el("section", "detail-section note-section");
      noteSection.append(
        el("h3", "detail-title", "Private notes"),
        el(
          "p",
          `notes${detail.reminder.notes ? "" : " empty"}`,
          detail.reminder.notes || "No notes saved yet.",
        ),
      );
      content.append(familySection, noteSection);
      const footer = el("footer", "friend-links"),
        social = el("a", "", "Social"),
        profile = el("a", "", "Profile");
      social.href = `/social?${new URLSearchParams({ f: detail.friend.handle })}`;
      profile.href = `/u/${encodeURIComponent(detail.friend.handle)}`;
      for (const link of [social, profile]) {
        link.setAttribute("aria-label", link.textContent!);
        const arrow = el("span", "link-arrow", "↗");
        arrow.setAttribute("aria-hidden", "true");
        link.append(arrow);
        enablePageLink(link);
      }
      footer.append(social, profile);
      content.append(footer);
    }
  }
  setSettings(settings: Settings) {
    if (this.finishInteraction) return;
    this.settings = settings;
    this.applySize();
    this.position();
  }
  private applySize() {
    this.host.style.width = `${Math.max(0, Math.min(this.settings.friendTooltipWidth, innerWidth - 24))}px`;
    this.host.style.height = `${Math.max(0, Math.min(this.settings.friendTooltipHeight, innerHeight - 24))}px`;
  }
  mount() {
    const parent = topDialog() ?? document.body;
    if (
      this.host.parentElement === parent &&
      this.host.matches(":popover-open")
    )
      return;
    if (this.host.matches(":popover-open")) this.host.hidePopover();
    parent.append(this.host);
    this.host.showPopover();
    this.position();
  }
  position() {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.disposed) return;
      this.applySize();
      const width = this.host.offsetWidth,
        height = this.host.offsetHeight,
        anchor = this.anchor?.isConnected
          ? this.anchor.getBoundingClientRect()
          : undefined;
      let left = this.placement?.left ?? Math.max(12, innerWidth - width - 12),
        top = this.placement?.top ?? 12;
      if (!this.pinned && anchor) {
        left = anchor.right + 8;
        if (left + width > innerWidth - 12) left = anchor.left - width - 8;
        top = anchor.top;
      }
      if (this.resizeBounds) {
        left = this.resizeBounds.left;
        top = this.resizeBounds.top;
      }
      left = Math.max(12, Math.min(left, innerWidth - width - 12));
      top = Math.max(12, Math.min(top, innerHeight - height - 12));
      this.host.style.left = `${left}px`;
      this.host.style.top = `${top}px`;
    });
  }
  private renderPin() {
    this.pin.replaceChildren(pinIcon());
    this.pin.title = this.pinned
      ? "Unpin friend tooltip · drag the header to move"
      : "Pin friend tooltip to keep it visible";
    this.pin.setAttribute(
      "aria-label",
      this.pinned ? "Unpin friend tooltip" : "Pin friend tooltip",
    );
    this.pin.setAttribute("aria-pressed", String(this.pinned));
    this.host.toggleAttribute("data-pinned", this.pinned);
  }
  private togglePin() {
    this.pinned = !this.pinned;
    if (this.pinned) {
      const rect = this.host.getBoundingClientRect();
      this.placement = { left: rect.left, top: rect.top };
    }
    this.renderPin();
    this.position();
    this.changed({
      pinned: this.pinned,
      ...(this.pinned && this.placement ? { position: this.placement } : {}),
    });
  }
  private enableDrag(header: HTMLElement) {
    header.addEventListener("pointerdown", (event) => {
      if (
        !this.pinned ||
        event.button !== 0 ||
        !event.isPrimary ||
        (event.target instanceof Element && event.target.closest("button,a"))
      )
        return;
      const rect = this.host.getBoundingClientRect(),
        startX = event.clientX,
        startY = event.clientY;
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        this.placement = {
          left: Math.max(
            12,
            Math.min(
              rect.left + next.clientX - startX,
              innerWidth - this.host.offsetWidth - 12,
            ),
          ),
          top: Math.max(
            12,
            Math.min(
              rect.top + next.clientY - startY,
              innerHeight - this.host.offsetHeight - 12,
            ),
          ),
        };
        this.position();
      };
      const stop = () => {
        header.removeEventListener("pointermove", move);
        header.removeEventListener("pointerup", stop);
        header.removeEventListener("pointercancel", stop);
        header.removeEventListener("lostpointercapture", stop);
        this.finishInteraction = undefined;
        if (this.placement) this.changed({ position: this.placement });
      };
      this.finishInteraction = stop;
      header.addEventListener("pointermove", move);
      header.addEventListener("pointerup", stop);
      header.addEventListener("pointercancel", stop);
      header.addEventListener("lostpointercapture", stop);
    });
  }
  private enableResize() {
    const apply = (bounds: PopupBounds) => {
      this.resizeBounds = bounds;
      this.settings = {
        ...this.settings,
        friendTooltipWidth: bounds.width,
        friendTooltipHeight: bounds.height,
      };
      this.applySize();
      if (this.pinned) this.placement = { left: bounds.left, top: bounds.top };
      this.position();
    };
    const finish = () => {
      this.resizeBounds = undefined;
      this.finishInteraction = undefined;
      this.changed({
        width: Math.round(this.settings.friendTooltipWidth),
        height: Math.round(this.settings.friendTooltipHeight),
        ...(this.pinned && this.placement ? { position: this.placement } : {}),
      });
      this.position();
    };
    for (const edge of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
      const handle = el("div", `resize-handle resize-${edge}`);
      handle.dataset.edge = edge;
      handle.tabIndex = edge.length === 1 ? 0 : -1;
      handle.setAttribute("aria-label", `Resize friend tooltip ${edge} edge`);
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.stopPropagation();
        handle.setPointerCapture(event.pointerId);
        const rect = this.host.getBoundingClientRect(),
          start = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          x = event.clientX,
          y = event.clientY;
        const move = (next: PointerEvent) => {
          if (next.pointerId === event.pointerId)
            apply(
              resizedBounds(
                start,
                edge,
                next.clientX - x,
                next.clientY - y,
                { width: innerWidth, height: innerHeight },
                LIMITS,
              ),
            );
        };
        const stop = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", stop);
          handle.removeEventListener("pointercancel", stop);
          handle.removeEventListener("lostpointercapture", stop);
          finish();
        };
        this.finishInteraction = stop;
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", stop);
        handle.addEventListener("pointercancel", stop);
        handle.addEventListener("lostpointercapture", stop);
      });
      handle.addEventListener("keydown", (event) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const rect = this.host.getBoundingClientRect(),
          step = event.shiftKey ? 50 : 10;
        apply(
          resizedBounds(
            {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
            edge,
            event.key === "ArrowLeft"
              ? -step
              : event.key === "ArrowRight"
                ? step
                : 0,
            event.key === "ArrowUp"
              ? -step
              : event.key === "ArrowDown"
                ? step
                : 0,
            { width: innerWidth, height: innerHeight },
            LIMITS,
          ),
        );
        finish();
      });
      this.shadow.append(handle);
    }
  }
  dispose() {
    this.finishInteraction?.();
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.host.remove();
    this.data = [];
  }
}
