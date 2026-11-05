import css from "./popup.css?inline";
import statCss from "./stat-box.css?inline";
import { defaults } from "../shared/settings";
import {
  statSnapshot,
  visibleStats,
  type HistoryState,
} from "../shared/stat-catalog";
import { statBox } from "./stat-box";
import { signalBadges } from "./signal-badges";
import type { CardSignals } from "./card-signals";
import type { Settings } from "../shared/types";
import {
  FINISHES,
  FINISH_LABEL,
  type Account,
  type Album,
  type CardContext,
  type CardInsights,
  type Finish,
  type KosmoraClient,
  type MarketHistory,
  type OwnedCopy,
  messageOf,
} from "../shared/types";
import { formatKosmo } from "../kosmora/contracts";
import { HOST_ID, topDialog } from "../kosmora/dom";
import { el, button, note } from "./ui";
import { sellPath } from "../kosmora/selling";
import { readTradeMatches, type TradeMatches } from "../shared/trade-matches";
import { CardNotes } from "./card-notes";
import {
  resizedBounds,
  type PopupBounds,
  type PopupLayoutChange,
} from "../shared/popup-layout";
import { lastSaleSummary } from "../shared/last-sale";
type PopupTab = "market" | "trade" | "notes";
export interface PopupPlacement {
  left: number;
  top: number;
  tab: PopupTab;
}
const COLORS: Record<Finish, string> = {
  plain: "#edcb82",
  veil: "#76dfcc",
  fullart: "#c3a0ff",
};
export class Popup {
  readonly host = el("div");
  readonly shadow = this.host.attachShadow({ mode: "open" });
  private metrics = el("div", "metrics");
  private statArea = el("div", "stat-area");
  private metricError = el("p", "note error metric-error");
  private headerSignals = el("span", "header-signals");
  private signals?: CardSignals;
  private priceScope = el("p", "summary-label price-scope");
  private market = el("section", "market-history");
  private tradeArea = el("section", "trade-panel");
  private notesArea = el("section", "card-notes-panel");
  private notes?: CardNotes;
  private lastSold = el("p", "last-sold");
  private layoutStatus = el("p", "layout-status");
  private resizeBounds?: PopupBounds;
  private finishInteraction?: () => void;
  private marketTab = button("Market", () => this.selectTab("market"), "tab");
  private tradeTab = button("Trade", () => this.selectTab("trade"), "tab");
  private notesTab = button("Notes", () => this.selectTab("notes"), "tab");
  private selectedTab: PopupTab = "market";
  private tradeResult?: TradeMatches;
  private tradeError?: string;
  private insightError?: string;
  private tradeRequest?: AbortController;
  private tradePending = false;
  private albumArea = el("section", "pinned-albums");
  private filterStatus = el("p", "note error filter-status");
  private sellButton = button("", () => void this.sell(), "icon sell-button");
  private status = el("p", "album-status");
  private histories: HistoryState = {};
  private hidden = new Set<Finish>();
  private details?: CardInsights;
  private account?: Account;
  private albums?: Album[];
  private chosen?: OwnedCopy;
  private pinned: string[] = [];
  private copyProblem?: string;
  private copiesResolved = false;
  private albumError?: string;
  private showAllSales = false;
  private selling = false;
  private pending = false;
  private closed = false;
  private placement?: PopupPlacement;
  private pinButton = button("", () => this.togglePin(), "icon pin-button");
  private reposition: ResizeObserver;
  constructor(
    readonly context: CardContext | null,
    private client: KosmoraClient,
    onRefresh: () => void,
    onClose: () => void,
    private openSettings: () => void,
    finishes: Finish[] = FINISHES,
    private onFinishesChange: (
      finishes: Finish[],
    ) => Promise<void> = async () => {},
    private settings: Settings = defaults(),
    placement?: PopupPlacement,
    private onPinChange: () => void = () => {},
    private onLayoutChange: (change: PopupLayoutChange) => void = () => {},
  ) {
    this.placement = placement ? { ...placement } : undefined;
    if (context)
      this.notes = new CardNotes(this.notesArea, context.subjectId, client);
    this.hidden = new Set(FINISHES.filter((f) => !finishes.includes(f)));
    this.host.id = HOST_ID;
    this.host.popover = "manual";
    this.host.setAttribute("role", "dialog");
    this.host.setAttribute(
      "aria-label",
      context ? `KosMore · ${context.name}` : "KosMore · No Card Selected",
    );
    this.host.toggleAttribute("data-empty", !context);
    const style = el("style");
    style.textContent = statCss + css;
    this.shadow.append(style);
    const top = el("header", "top"),
      brand = el("div", "brand", "✦ KosMore"),
      actions = el("div", "actions");
    actions.append(
      button(
        "Refresh",
        () =>
          this.selectedTab === "trade"
            ? this.refreshTrade(true)
            : this.selectedTab === "notes"
              ? this.notes?.refresh()
              : onRefresh(),
        "icon refresh-button",
      ),
      this.pinButton,
      button("×", onClose, "icon"),
    );
    const pinIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    pinIcon.setAttribute("viewBox", "0 0 24 24");
    pinIcon.setAttribute("width", "16");
    pinIcon.setAttribute("height", "16");
    pinIcon.setAttribute("fill", "none");
    pinIcon.setAttribute("stroke", "currentColor");
    pinIcon.setAttribute("stroke-width", "1.7");
    pinIcon.setAttribute("stroke-linecap", "round");
    pinIcon.setAttribute("stroke-linejoin", "round");
    pinIcon.setAttribute("aria-hidden", "true");
    const pinPath = document.createElementNS(pinIcon.namespaceURI, "path");
    pinPath.setAttribute(
      "d",
      "M16 3 21 8 17 9 14 12 14 16 12 18 6 12 8 10 12 10 15 7Z M9 15 3 21",
    );
    pinIcon.append(pinPath);
    this.pinButton.append(pinIcon);
    this.renderPin();
    this.enableDragging(top);
    this.applySize();
    actions.lastElementChild!.setAttribute("aria-label", "Close KosMore popup");
    brand.append(actions);
    const titleRow = el("div", "title-row");
    this.sellButton.setAttribute("aria-label", "Sell card");
    this.sellButton.title = "Loading owned copies…";
    this.sellButton.disabled = true;
    const gavel = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    gavel.setAttribute("viewBox", "0 0 24 24");
    gavel.setAttribute("width", "20");
    gavel.setAttribute("height", "20");
    gavel.setAttribute("fill", "none");
    gavel.setAttribute("stroke", "currentColor");
    gavel.setAttribute("stroke-width", "1.7");
    gavel.setAttribute("stroke-linecap", "round");
    gavel.setAttribute("stroke-linejoin", "round");
    gavel.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(gavel.namespaceURI, "path");
    path.setAttribute(
      "d",
      "m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10 M16 16l6-6 M8 8l6-6 M9 7l8 8 M21 11l-8-8",
    );
    gavel.append(path);
    this.sellButton.append(gavel);
    const titleActions = el("div", "title-actions");
    titleActions.append(this.headerSignals, this.sellButton);
    titleRow.append(el("h2", "", context?.name ?? ""), titleActions);
    top.append(
      brand,
      titleRow,
      el(
        "p",
        "subtitle",
        context
          ? `No. ${context.subjectId} · ${context.variant.fullArt ? "Full art" : context.variant.veil ? "Shiny" : "Standard"}`
          : "",
      ),
      this.lastSold,
    );
    const tabs = el("div", "tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Card insights");
    const names: PopupTab[] = ["market", "trade", "notes"];
    const buttons = [this.marketTab, this.tradeTab, this.notesTab];
    const panels = [this.market, this.tradeArea, this.notesArea];
    for (const [index, tab] of buttons.entries()) {
      const panel = panels[index];
      tab.id = `kosmore-${names[index]}-tab`;
      panel.id = `kosmore-${names[index]}-panel`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? names.length - 1
              : (names.indexOf(this.selectedTab) +
                  (event.key === "ArrowRight" ? 1 : names.length - 1)) %
                names.length;
        this.selectTab(names[nextIndex]);
        buttons[nextIndex].focus();
      });
      tabs.append(tab);
    }
    const body = el("div", "body");
    this.statArea.append(this.metrics, this.priceScope, this.metricError);
    const tabContent = el("div", "tab-content");
    tabContent.append(this.market, this.tradeArea, this.notesArea);
    const tabWorkspace = el("div", "tab-workspace");
    tabWorkspace.append(tabs, tabContent);
    body.append(this.albumArea, this.statArea, tabWorkspace);
    const footer = el("footer", "footer");
    footer.append(
      el("span", "", "Kosmora card companion"),
      button("Settings", openSettings, "link"),
    );
    body.append(footer);
    const empty = el("div", "empty-state", "No Card Selected");
    empty.setAttribute("role", "status");
    this.layoutStatus.setAttribute("role", "status");
    this.shadow.append(top, empty, body, this.layoutStatus);
    this.enableResizing();
    this.metrics.setAttribute("aria-live", "polite");
    this.albumArea.setAttribute("aria-live", "polite");
    this.tradeArea.setAttribute("aria-live", "polite");
    this.selectTab(this.placement?.tab ?? "market");
    if (context) {
      this.renderMetrics();
      this.renderMarket();
      this.albumArea.append(note("Loading your albums…"));
    }
    (topDialog() ?? document.body).append(this.host);
    this.host.showPopover();
    for (const event of [
      "pointerdown",
      "pointerup",
      "click",
      "dblclick",
      "mousedown",
      "mouseup",
      "keydown",
      "keyup",
      "wheel",
    ])
      this.host.addEventListener(event, (e) => {
        e.stopPropagation();
      });
    this.host.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    });
    this.reposition = new ResizeObserver(() => this.position());
    this.reposition.observe(this.host);
    this.position();
  }
  dispose() {
    this.finishInteraction?.();
    this.closed = true;
    this.tradeRequest?.abort();
    this.notes?.dispose();
    this.reposition.disconnect();
    this.host.remove();
  }
  get isPinned() {
    return !!this.placement;
  }
  pinnedPlacement(): PopupPlacement | undefined {
    return this.placement
      ? { ...this.placement, tab: this.selectedTab }
      : undefined;
  }
  private togglePin() {
    const bounds = this.host.getBoundingClientRect();
    this.placement = this.placement
      ? undefined
      : {
          left: this.settings.popupPosition?.left ?? bounds.left,
          top: this.settings.popupPosition?.top ?? bounds.top,
          tab: this.selectedTab,
        };
    this.renderPin();
    this.position();
    this.saveLayout();
    this.onPinChange();
  }
  private renderPin() {
    this.host.toggleAttribute("data-pinned", this.isPinned);
    this.pinButton.setAttribute("aria-pressed", String(this.isPinned));
    this.pinButton.setAttribute(
      "aria-label",
      this.isPinned ? "Unpin popup" : "Pin popup",
    );
    this.pinButton.title = this.isPinned
      ? "Unpin popup · drag the header to move"
      : "Pin popup to keep it visible";
  }
  private applySize() {
    this.host.style.setProperty(
      "--popup-width",
      `${this.settings.popupWidth}px`,
    );
    this.host.style.setProperty(
      "--popup-height",
      `${this.settings.popupHeight}px`,
    );
  }
  private saveLayout() {
    const position = this.placement
      ? {
          left: Math.round(this.placement.left),
          top: Math.round(this.placement.top),
        }
      : undefined;
    this.settings = {
      ...this.settings,
      popupPosition: position ?? this.settings.popupPosition,
    };
    this.layoutStatus.textContent = "";
    this.onLayoutChange({
      pinned: this.isPinned,
      ...(position ? { position } : {}),
      width: this.settings.popupWidth,
      height: this.settings.popupHeight,
    });
  }
  layoutFailed(error: unknown) {
    if (!this.closed)
      this.layoutStatus.textContent = `Could not remember popup layout: ${messageOf(error)}`;
  }
  mount() {
    const parent = topDialog() ?? document.body;
    if (this.host.parentElement !== parent) {
      if (this.host.matches(":popover-open")) this.host.hidePopover();
      parent.append(this.host);
    }
    if (!this.host.matches(":popover-open")) this.host.showPopover();
    this.position();
  }
  private enableResizing() {
    for (const edge of ["n", "e", "s", "w", "ne", "se", "sw", "nw"]) {
      const handle = el("div", `resize-handle resize-${edge}`);
      handle.dataset.edge = edge;
      handle.setAttribute("aria-label", `Resize popup ${edge} edge`);
      if (edge.length === 1) {
        handle.tabIndex = 0;
        handle.setAttribute("role", "separator");
        handle.setAttribute(
          "aria-orientation",
          edge === "n" || edge === "s" ? "horizontal" : "vertical",
        );
      }
      const apply = (bounds: PopupBounds) => {
        this.resizeBounds = bounds;
        this.settings = {
          ...this.settings,
          popupWidth: Math.max(320, Math.round(bounds.width)),
          popupHeight: Math.max(480, Math.round(bounds.height)),
        };
        if (this.placement) {
          this.placement.left = bounds.left;
          this.placement.top = bounds.top;
        }
        this.applySize();
        this.position();
      };
      const finish = () => {
        this.resizeBounds = undefined;
        this.finishInteraction = undefined;
        this.host.removeAttribute("data-resizing");
        this.position();
        this.saveLayout();
      };
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = this.host.getBoundingClientRect();
        const start = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
        const x = event.clientX,
          y = event.clientY,
          id = event.pointerId;
        handle.setPointerCapture(id);
        this.host.setAttribute("data-resizing", "");
        const move = (event: PointerEvent) => {
          if (event.pointerId === id)
            apply(
              resizedBounds(start, edge, event.clientX - x, event.clientY - y, {
                width: innerWidth,
                height: innerHeight,
              }),
            );
        };
        const stop = (event: PointerEvent) => {
          if (event.pointerId === id) this.finishInteraction?.();
        };
        this.finishInteraction = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", stop);
          handle.removeEventListener("pointercancel", stop);
          handle.removeEventListener("lostpointercapture", stop);
          if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
          finish();
        };
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
          ),
        );
        finish();
      });
      this.shadow.append(handle);
    }
  }
  private enableDragging(header: HTMLElement) {
    let drag:
      | { id: number; x: number; y: number; left: number; top: number }
      | undefined;
    header.addEventListener("pointerdown", (event) => {
      if (
        !this.isPinned ||
        event.button !== 0 ||
        !event.isPrimary ||
        (event.target instanceof Element &&
          event.target.closest("button, a, input, select, textarea"))
      )
        return;
      const bounds = this.host.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: bounds.left,
        top: bounds.top,
      };
      header.setPointerCapture(event.pointerId);
      this.host.toggleAttribute("data-dragging", true);
      this.finishInteraction = () => {
        drag = undefined;
        this.finishInteraction = undefined;
        this.host.removeAttribute("data-dragging");
        this.saveLayout();
      };
      event.preventDefault();
    });
    header.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId || !this.placement) return;
      this.placement.left = Math.max(
        12,
        Math.min(
          drag.left + event.clientX - drag.x,
          innerWidth - this.host.offsetWidth - 12,
        ),
      );
      this.placement.top = Math.max(
        12,
        Math.min(
          drag.top + event.clientY - drag.y,
          innerHeight - this.host.offsetHeight - 12,
        ),
      );
      this.position();
    });
    const stop = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      this.finishInteraction?.();
      if (header.hasPointerCapture(event.pointerId))
        header.releasePointerCapture(event.pointerId);
    };
    header.addEventListener("pointerup", stop);
    header.addEventListener("pointercancel", stop);
    header.addEventListener("lostpointercapture", stop);
  }
  position() {
    if (this.closed) return;
    if (this.resizeBounds) {
      this.host.style.left = `${this.resizeBounds.left}px`;
      this.host.style.top = `${this.resizeBounds.top}px`;
      return;
    }
    if (this.placement) {
      const left = Math.max(
        12,
        Math.min(this.placement.left, innerWidth - this.host.offsetWidth - 12),
      );
      const top = Math.max(
        12,
        Math.min(this.placement.top, innerHeight - this.host.offsetHeight - 12),
      );
      this.host.style.left = `${left}px`;
      this.host.style.top = `${top}px`;
      return;
    }
    if (!this.context) return;
    const r = this.context.anchor.getBoundingClientRect(),
      w = this.host.offsetWidth,
      h = this.host.offsetHeight;
    let left = r.right + 12;
    if (left + w > innerWidth - 12) left = r.left - w - 12;
    if (left < 12) left = Math.max(12, Math.min(r.left, innerWidth - w - 12));
    const top = Math.max(12, Math.min(r.top, innerHeight - h - 12));
    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
  }
  setInsights(details: CardInsights) {
    if (!this.context) return;
    this.details = details;
    this.insightError = undefined;
    const sub = this.shadow.querySelector(".subtitle");
    if (sub)
      sub.textContent = `${details.rarity} · No. ${details.subjectId} · ${this.context.variant.fullArt ? "Full art" : this.context.variant.veil ? "Shiny" : "Standard"}`;
    this.renderMetrics();
    this.renderAlbums();
    this.refreshTrade();
  }
  insightsFailed(error: unknown) {
    this.insightError = messageOf(error);
    this.renderMetrics();
    if (!this.account) this.notes?.failed(error);
    this.renderTrade();
  }
  setHistory(finish: Finish, result: MarketHistory | Error) {
    this.histories[finish] = result;
    this.renderMetrics();
    this.renderMarket();
  }
  setFinishes(finishes: Finish[]) {
    this.hidden = new Set(FINISHES.filter((f) => !finishes.includes(f)));
    this.renderMetrics();
    this.renderMarket();
  }
  setAccount(account: Account, pinned: string[]) {
    this.account = account;
    this.notes?.setAccount(account);
    this.pinned = pinned;
    this.renderAlbums();
    this.refreshTrade();
  }
  refreshTrade(fresh = false) {
    this.tradeRequest?.abort();
    this.tradeRequest = undefined;
    this.tradePending = false;
    this.tradeResult = undefined;
    this.tradeError = undefined;
    this.renderTrade();
    if (this.selectedTab === "trade") void this.loadTrade(fresh);
  }
  private selectTab(tab: PopupTab) {
    this.selectedTab = tab;
    this.market.hidden = tab !== "market";
    this.tradeArea.hidden = tab !== "trade";
    this.notesArea.hidden = tab !== "notes";
    for (const [name, button] of [
      ["market", this.marketTab],
      ["trade", this.tradeTab],
      ["notes", this.notesTab],
    ] as const) {
      button.setAttribute("aria-selected", String(name === tab));
      button.tabIndex = name === tab ? 0 : -1;
    }
    if (tab === "trade") void this.loadTrade();
    if (tab === "notes") this.notes?.activate();
  }
  private async loadTrade(fresh = false) {
    this.renderTrade();
    if (
      this.closed ||
      this.tradePending ||
      this.tradeResult ||
      !this.account ||
      !this.details?.families?.length ||
      this.insightError
    )
      return;
    const request = new AbortController(),
      accountKey = this.account.key,
      families = this.details.families;
    this.tradeRequest = request;
    this.tradePending = true;
    this.tradeError = undefined;
    const valid = () =>
      !this.closed && !request.signal.aborted && this.tradeRequest === request;
    try {
      if ((await this.client.account(request.signal)).key !== accountKey)
        throw new Error("Your Kosmora account changed. Reopen the popup.");
      const friends = await this.client.friends(request.signal, fresh);
      if (!valid()) return;
      const result = await readTradeMatches(accountKey, families, friends);
      if (valid()) this.tradeResult = result;
    } catch (error) {
      if (valid()) this.tradeError = messageOf(error);
    } finally {
      if (valid()) {
        this.tradePending = false;
        this.renderTrade();
      }
    }
  }
  private renderTrade() {
    const area = this.tradeArea;
    area.replaceChildren(
      this.heading("Friends who may be interested"),
      note("Based on family preferences you saved for friends."),
    );
    if (this.insightError) {
      area.append(note(this.insightError, true));
      return;
    }
    if (!this.account || !this.details) {
      area.append(note("Loading card families…"));
      return;
    }
    if (this.details.families === null) {
      area.append(
        note(
          "This card's families are unavailable. Refresh to try again.",
          true,
        ),
      );
      return;
    }
    if (!this.details.families.length) {
      area.append(note("This card has no families to match."));
      return;
    }
    const familyList = el(
      "p",
      "note card-families",
      `Card families: ${this.details.families.map((f) => f.name).join(" · ")}`,
    );
    area.append(familyList);
    if (this.tradeError) {
      area.append(
        note(this.tradeError, true),
        button("Retry matches", () => this.refreshTrade(true)),
      );
      return;
    }
    if (!this.tradeResult) {
      area.append(note("Checking your friends' saved families…"));
      return;
    }
    const result = this.tradeResult;
    if (!result.matches.length) {
      area.append(
        note(
          result.friendsWithPreferences
            ? "No friends match this card's families."
            : "No saved family preferences for your current friends yet.",
        ),
      );
    } else {
      const list = el("ul", "trade-matches");
      list.setAttribute("aria-label", "Matching friends");
      for (const match of result.matches) {
        const row = el("li", "trade-match"),
          link = el("a", "friend-link", match.friend.handle);
        link.href = `/social?f=${encodeURIComponent(match.friend.handle)}`;
        link.title = `Open ${match.friend.handle} on Social`;
        const families = el("div", "matched-families");
        for (const family of match.families)
          families.append(el("span", "family-chip", family.name));
        row.append(link, families);
        list.append(row);
      }
      area.append(list);
    }
    if (result.unreadable)
      area.append(
        note(
          "Some saved family preferences could not be read. Matches may be incomplete.",
          true,
        ),
      );
    const social = el(
      "a",
      "social-link",
      "Edit friends' family preferences on Social",
    );
    social.href = "/social";
    area.append(social);
  }
  setCopies(chosen?: OwnedCopy, problem?: string) {
    this.chosen = chosen;
    this.copyProblem = problem;
    this.copiesResolved = true;
    this.renderAlbums();
  }
  setAlbums(account: Account, albums: Album[], pinned: string[]) {
    this.account = account;
    this.albums = albums;
    this.pinned = pinned;
    this.albumError = undefined;
    this.renderAlbums();
  }
  albumsFailed(error: unknown) {
    this.albumError = messageOf(error);
    this.renderAlbums();
  }
  private heading(text: string, aside?: string) {
    const h = el("div", "section-heading");
    h.append(el("h3", "", text));
    if (aside) h.append(el("span", "", aside));
    return h;
  }
  setSettings(settings: Settings) {
    if (this.resizeBounds) {
      this.settings = {
        ...settings,
        popupWidth: this.settings.popupWidth,
        popupHeight: this.settings.popupHeight,
      };
      return;
    }
    this.settings = settings;
    this.applySize();
    this.position();
    if (!this.context) return;
    this.renderMetrics();
    if (this.account)
      this.pinned = settings.pinnedAlbums[this.account.key] ?? [];
    this.renderAlbums();
    this.renderHeaderSignals();
  }
  setSignals(signals?: CardSignals) {
    this.signals = signals;
    this.renderHeaderSignals();
  }
  private renderHeaderSignals() {
    this.headerSignals.replaceChildren(
      ...(this.signals ? signalBadges(this.signals, this.settings) : []),
    );
  }
  private renderMetrics() {
    const definitions = visibleStats(this.settings.stats);
    const snapshot = statSnapshot(
      this.details,
      this.histories,
      FINISHES.filter((f) => !this.hidden.has(f)),
      this.insightError,
    );
    this.metrics.replaceChildren(
      ...definitions.map((d) => statBox(d, d.read(snapshot))),
    );
    this.statArea.hidden = !definitions.length;
    this.priceScope.textContent = definitions.some((d) => d.source === "prices")
      ? snapshot.priceNotice
      : "";
    this.metricError.textContent = definitions.some((d) => d.source === "card")
      ? (this.insightError ?? "")
      : "";
  }
  private renderMarket() {
    const lastSale = lastSaleSummary(
      this.histories,
      FINISHES.filter((f) => !this.hidden.has(f)),
    );
    this.lastSold.textContent = lastSale.label;
    this.lastSold.title = lastSale.title;
    this.market.replaceChildren(
      this.heading("Market history", "30-day window"),
    );
    const legend = el("div", "legend");
    for (const finish of FINISHES) {
      const label = el("label"),
        check = el("input");
      check.type = "checkbox";
      check.checked = !this.hidden.has(finish);
      check.style.accentColor = COLORS[finish];
      check.addEventListener("change", () => {
        if (check.checked) this.hidden.delete(finish);
        else this.hidden.add(finish);
        this.renderMetrics();
        this.renderMarket();
        this.filterStatus.textContent = "";
        void this.onFinishesChange(
          FINISHES.filter((f) => !this.hidden.has(f)),
        ).catch((error) => {
          if (!this.closed)
            this.filterStatus.textContent = `Could not save filters: ${messageOf(error)}`;
        });
      });
      label.append(check, document.createTextNode(FINISH_LABEL[finish]));
      legend.append(label);
    }
    this.market.append(legend, this.filterStatus);
    const available = FINISHES.filter((f) => !this.hidden.has(f)).flatMap(
      (f) => {
        const h = this.histories[f];
        return h && !(h instanceof Error) ? [h] : [];
      },
    );
    const sales = available
      .flatMap((h) => h.sales)
      .sort((a, b) => Date.parse(b.soldAt) - Date.parse(a.soldAt));
    if (sales.length) this.market.append(this.chart(available));
    const table = el("table", "stats");
    table.setAttribute("aria-label", "Market summaries by variant");
    const head = el("tr");
    for (const title of ["Variant", "Sales", "Min", "Median", "Max"])
      head.append(el("th", "", title));
    const thead = el("thead");
    thead.append(head);
    table.append(thead);
    const tbody = el("tbody");
    for (const f of FINISHES) {
      if (this.hidden.has(f)) continue;
      const state = this.histories[f],
        row = el("tr");
      row.append(el("td", "", FINISH_LABEL[f]));
      if (!state || state instanceof Error) {
        const td = el(
          "td",
          "",
          state instanceof Error ? "Unavailable" : "Loading…",
        );
        td.colSpan = 4;
        row.append(td);
      } else
        for (const value of [
          String(state.count),
          state.low ? formatKosmo(state.low) : "—",
          state.median ? formatKosmo(state.median) : "—",
          state.high ? formatKosmo(state.high) : "—",
        ])
          row.append(el("td", "", value));
      tbody.append(row);
    }
    table.append(tbody);
    this.market.append(table);
    for (const f of FINISHES) {
      if (this.hidden.has(f)) continue;
      const h = this.histories[f];
      if (h instanceof Error)
        this.market.append(note(`${FINISH_LABEL[f]}: ${h.message}`, true));
    }
    if (available.some((h) => !h.complete))
      this.market.append(
        note(
          "The chart uses the returned sales sample. Counts and price summaries cover the reported window.",
        ),
      );
    if (sales.length) {
      this.market.append(
        this.heading(
          "Recent sales",
          `Latest ${this.showAllSales ? sales.length : Math.min(5, sales.length)} of ${sales.length}`,
        ),
      );
      const list = el("ol", "sales");
      list.id = "kosmore-sales";
      for (const s of this.showAllSales ? sales : sales.slice(0, 5)) {
        const li = el("li"),
          time = el(
            "time",
            "",
            new Date(s.soldAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
          );
        time.dateTime = s.soldAt;
        time.title = new Date(s.soldAt).toLocaleString();
        li.append(
          time,
          el("span", "finish", FINISH_LABEL[s.finish]),
          el("b", "", formatKosmo(s.price)),
        );
        list.append(li);
      }
      this.market.append(list);
      if (sales.length > 5) {
        const expand = button(
          this.showAllSales ? "Show Less" : "Show All",
          () => {
            const restoreFocus = this.shadow.activeElement === expand;
            this.showAllSales = !this.showAllSales;
            this.renderMarket();
            this.position();
            if (restoreFocus)
              this.market
                .querySelector<HTMLButtonElement>(".sales-toggle")
                ?.focus({ preventScroll: true });
          },
          "sales-toggle",
        );
        expand.setAttribute("aria-expanded", String(this.showAllSales));
        expand.setAttribute("aria-controls", list.id);
        this.market.append(expand);
      }
    } else if (available.length)
      this.market.append(
        note("No completed sales in the available variant histories."),
      );
  }
  private chart(histories: MarketHistory[]) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 400 130");
    svg.classList.add("chart");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Completed sale prices over the last 30 days, separated by variant",
    );
    const sales = histories.flatMap((h) => h.sales),
      values = sales.map((s) => BigInt(s.price));
    const low = values.reduce((a, b) => (a < b ? a : b)),
      high = values.reduce((a, b) => (a > b ? a : b)),
      range = high - low || 1n;
    const start = Date.now() - 30 * 86400000;
    for (const y of [20, 55, 90]) {
      const line = document.createElementNS(svg.namespaceURI, "line");
      for (const [k, v] of Object.entries({
        x1: 12,
        x2: 388,
        y1: y,
        y2: y,
        stroke: "#ffffff0c",
      }))
        line.setAttribute(k, String(v));
      svg.append(line);
    }
    for (const h of histories) {
      const points = [...h.sales]
        .sort((a, b) => Date.parse(a.soldAt) - Date.parse(b.soldAt))
        .map((s) => ({
          sale: s,
          x:
            12 +
            Math.max(
              0,
              Math.min(1, (Date.parse(s.soldAt) - start) / (30 * 86400000)),
            ) *
              376,
          y: 90 - Number(((BigInt(s.price) - low) * 70000n) / range) / 1000,
        }));
      const path = document.createElementNS(svg.namespaceURI, "polyline");
      path.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", COLORS[h.finish]);
      path.setAttribute("stroke-opacity", ".65");
      svg.append(path);
      for (const p of points) {
        const circle = document.createElementNS(svg.namespaceURI, "circle");
        circle.setAttribute("cx", String(p.x));
        circle.setAttribute("cy", String(p.y));
        circle.setAttribute("r", "3");
        circle.setAttribute("fill", COLORS[h.finish]);
        const title = document.createElementNS(svg.namespaceURI, "title");
        title.textContent = `${FINISH_LABEL[h.finish]} · ${formatKosmo(p.sale.price)} Kosmo · ${new Date(p.sale.soldAt).toLocaleString()}`;
        circle.append(title);
        svg.append(circle);
      }
    }
    for (const [x, text] of [
      [12, "30 days ago"],
      [340, "Today"],
    ] as const) {
      const t = document.createElementNS(svg.namespaceURI, "text");
      t.setAttribute("x", String(x));
      t.setAttribute("y", "118");
      t.setAttribute("fill", "#aa98bd");
      t.setAttribute("font-size", "10");
      t.textContent = text;
      svg.append(t);
    }
    return svg;
  }
  private renderAlbums() {
    const area = this.albumArea;
    area.replaceChildren(this.heading("Pinned albums"));
    this.renderSell();
    if (!this.account) {
      area.append(
        note(this.albumError ?? "Loading your albums…", !!this.albumError),
      );
      return;
    }
    const copies = this.details?.copies ?? [];
    if (this.copyProblem) area.append(note(this.copyProblem, true));
    if (!copies.length) {
      area.append(
        note(
          this.details
            ? "Own a copy of this card to add it to an album."
            : "Loading owned copies…",
        ),
      );
      return;
    }
    if (!this.copiesResolved) {
      area.append(note("Identifying the owned copy…"));
      return;
    }
    if (copies.length > 1 || this.copyProblem) {
      const label = el("label", "copy-label", "Choose an owned copy");
      const select = el("select");
      select.setAttribute("aria-label", "Owned copy");
      const blank = el("option", "", "Select a copy…");
      blank.value = "";
      select.append(blank);
      for (const c of copies) {
        const o = el(
          "option",
          "",
          `${c.variant.fullArt ? "Full art" : c.variant.veil ? "Shiny" : "Standard"}${c.serial ? ` #${c.serial}` : ""} · ${c.id.slice(0, 8)} · ${c.state}`,
        );
        o.value = c.id;
        select.append(o);
      }
      select.value = this.chosen?.id ?? "";
      select.addEventListener("change", () => {
        this.chosen = copies.find((c) => c.id === select.value);
        this.renderAlbums();
      });
      label.append(select);
      area.append(label);
    }
    const selected = this.selectedCopy();
    if (!this.pinned.length) {
      area.append(
        note("Pin the albums you use most for quick access."),
        button("Choose pinned albums", this.openSettings, "link"),
      );
      return;
    }
    if (this.albumError) {
      area.append(note(this.albumError, true));
      return;
    }
    if (!this.albums) {
      area.append(note("Loading your albums…"));
      return;
    }
    const grid = el("div", "albums");
    for (const id of this.pinned) {
      const album = this.albums.find((a) => a.id === id);
      const b = button(
        album?.name ?? "Album unavailable",
        () => void this.add(id, selected),
      );
      const why = !album
        ? "Unavailable"
        : album.contains
          ? "Already added"
          : album.items >= 2000
            ? "Album full"
            : !selected
              ? "Choose a copy"
              : undefined;
      if (why) b.append(el("small", "", why));
      b.disabled = !!why || this.pending;
      grid.append(b);
    }
    area.append(grid, this.status);
  }
  private selectedCopy(): OwnedCopy | undefined {
    if (!this.copiesResolved) return undefined;
    const copies = this.details?.copies ?? [];
    return (
      this.chosen ??
      (!this.copyProblem && copies.length === 1 ? copies[0] : undefined)
    );
  }
  private renderSell() {
    const copy = this.selectedCopy();
    this.sellButton.disabled =
      !copy || copy.state !== "available" || this.pending || this.selling;
    this.sellButton.title = !this.details
      ? "Loading owned copies…"
      : !this.details.copies.length
        ? "Own a copy of this card to sell it."
        : !copy
          ? "Choose an owned copy below to sell it."
          : copy.state !== "available"
            ? "This copy is not available to sell."
            : "Open the sell form for this owned copy";
  }
  private async sell() {
    if (!this.context) return;
    const copy = this.selectedCopy();
    if (!copy || !this.account || this.selling || this.pending) return;
    const sourceUrl = location.href;
    this.selling = true;
    this.status.className = "album-status";
    this.status.textContent = "Opening sell form…";
    if (!this.status.isConnected) this.albumArea.append(this.status);
    this.renderSell();
    try {
      if ((await this.client.account()).key !== this.account.key)
        throw new Error("Your Kosmora account changed. Reopen the popup.");
      const fresh = await this.client.insights(
        this.context.subjectId,
        undefined,
        true,
      );
      const owned = fresh.copies.find((c) => c.id === copy.id);
      if (!owned) throw new Error("You no longer own this copy.");
      // The click requests navigation independently of the hover popup's lifetime.
      // Respect a later page navigation while the ownership check was pending.
      if (location.href === sourceUrl) location.assign(sellPath(owned));
    } catch (error) {
      this.status.className = "album-status error";
      this.status.textContent = messageOf(error);
    } finally {
      this.selling = false;
      if (!this.closed) this.renderSell();
    }
  }
  private async add(id: string, copy?: OwnedCopy) {
    if (!this.context) return;
    if (!copy || !this.account || this.pending) return;
    this.pending = true;
    this.status.className = "album-status";
    this.status.textContent = "Adding to album…";
    this.renderAlbums();
    try {
      await this.client.add(id, copy, this.account.key);
      this.albums = await this.client.albums(this.context.subjectId);
      this.status.textContent = "Added to album.";
    } catch (error) {
      this.status.className = "album-status error";
      this.status.textContent = messageOf(error);
      try {
        this.albums = await this.client.albums(this.context.subjectId);
      } catch {
        /* Keep existing state; next attempt rechecks it. */
      }
    } finally {
      this.pending = false;
      if (!this.closed) this.renderAlbums();
    }
  }
}
