import { hasFriendInterests } from "../shared/trade-matches";
import { LISTING_REFRESH_LABEL } from "../kosmora/my-listings";
import { setRequestPriority } from "../shared/request-scheduler";
import { headerIcon, pinIcon, tooltipIcon } from "./icons";
import css from "./popup.css?inline";
import headerCss from "./tooltip-header-buttons.css?inline";
import friendListCss from "./friend-list.css?inline";
import { FriendList } from "./friend-list";
import { ListingHistory } from "./listing-history";
import statCss from "./stat-box.css?inline";
import { defaults } from "../shared/settings";
import { shortcutKey } from "../shared/hotkeys";
import {
  statSnapshot,
  visibleStats,
  type HistoryState,
} from "../shared/stat-catalog";
import { statBox } from "./stat-box";
import { saleObservations } from "./sale-observation-store";
import { dailySalePrices, type DailySalePrice } from "../shared/market-summary";
import {
  finishOf,
  saleRates,
  type SaleRates,
} from "../shared/sale-observations";
import { SIGNAL_BADGE_CSS, signalBadges, numberOneIcon, auctionBidSuffix, highlightOwnPrice } from "./signal-badges";
import { auctionIcon, cardIcon } from "./icons";
import { enableMarketLink, marketSearchPath } from "./market-links";
import type { CardSignals } from "./card-signals";
import type { Settings } from "../shared/types";
import {
  FINISHES,
  FINISH_LABEL,
  type Account,
  type AuctionPrice,
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
import {
  tradePath,
  transferProblem,
  type TransferAction,
} from "../kosmora/copy-actions";
import { giftPath } from "./gift-handoff";
import type { HoverTooltipId } from "../shared/hotkeys";
import { readTradeMatches, type TradeMatches } from "../shared/trade-matches";
import { CardNotes } from "./card-notes";
import type { FriendTooltip } from "./friend-tooltip";
import {
  resizedBounds,
  tooltipScale,
  POPUP_TABS,
  type PopupBounds,
  type PopupLayoutChange,
  type PopupPosition,
  type PopupTab,
} from "../shared/popup-layout";
import { salePriceSummary } from "../shared/last-sale";
import { CardNotFoundError } from "../shared/services";
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
  private marketBody = el("div", "market-body");
  private marketLegend?: HTMLElement;
  private selectedDay?: string;
  private marketFrame = 0;
  private tradeArea = el("section", "trade-panel");
  private listingArea = el("section", "listing-history-panel");
  private listingHistory?: ListingHistory;
  private historyRefreshBusy = false;
  private refreshButton!: HTMLButtonElement;
  private tradeFriends = new FriendList();
  private notesArea = el("section", "card-notes-panel");
  private notes?: CardNotes;
  private familyBadges = el("div", "family-badges");
  private headerPrices = el("div", "header-prices");
  private lastSold = el("p", "last-sold market-badge sale");
  private listedFor = el("a", "listed-for market-badge auction");
  private listingPriceStale = false;
  private lowestListing?: AuctionPrice | Error | null;
  private layoutStatus = el("p", "layout-status");
  private resizeBounds?: PopupBounds;
  private finishInteraction?: () => void;
  private marketTab = button("", () => this.selectTab("market"), "tab");
  private historyTab = button("", () => this.selectTab("history"), "tab");
  private tradeTab = button("", () => this.selectTab("trade"), "tab");
  private notesTab = button("", () => this.selectTab("notes"), "tab");
  private selectedTab: PopupTab = "market";
  private tradeResult?: TradeMatches;
  private cachedTradeFriends?: Awaited<ReturnType<KosmoraClient["friends"]>>;
  private tradeError?: string;
  private insightError?: Error;
  private get missingNumberOne() {
    return !!this.context?.numberOne && this.insightError instanceof CardNotFoundError;
  }
  private readonly displayedFinish: Finish | undefined;
  private activeAuctions?: number | Error;
  private auctionRequest?: AbortController;
  private tradeRequest?: AbortController;
  private tradePending = false;
  private albumArea = el("section", "pinned-albums");
  private filterStatus = el("p", "note error filter-status");
  private sellButton = button(
    "",
    () => void this.openCopyAction("sell"),
    "sell-button",
  );
  private giftButton = button(
    "Gift",
    () => void this.openCopyAction("gift"),
    "transfer-button",
  );
  private tradeButton = button(
    "Trade",
    () => void this.openCopyAction("trade"),
    "transfer-button",
  );
  private closeButton: HTMLButtonElement;
  private settingsButton: HTMLButtonElement;
  private status = el("p", "album-status");
  private histories: HistoryState = {};
  private staleHistories = new Set<Finish>();
  private hidden = new Set<Finish>();
  private details?: CardInsights;
  private account?: Account;
  private albums?: Album[];
  private chosen?: OwnedCopy;
  private pinned: string[] = [];
  private copyProblem?: string;
  private copiesResolved = false;
  private ownedCopies?: OwnedCopy[];
  private copyScope?: string;
  private copyRequest?: AbortController;
  private albumError?: string;
  private albumRequest?: AbortController;
  private albumRefresh = false;
  private albumVisible = false;
  private albumVisibility = new IntersectionObserver(([record]) => {
    this.albumVisible = !!record?.isIntersecting;
    if (this.albumVisible) void this.loadAlbums();
    else this.albumRequest?.abort();
  });
  private openingCopyAction = false;
  private pending = false;
  private closed = false;
  private scrollTouch?: Touch;
  private placement?: PopupPlacement;
  private pinButton = button("", () => this.togglePin(), "icon pin-button");
  private reposition: ResizeObserver;
  private observationFrame = 0;
  // Redraw only when this card's listings changed, at most once per frame.
  private stopObservations = saleObservations.subscribe((subjects) => {
    if (
      this.closed ||
      this.observationFrame ||
      !this.context ||
      !subjects.has(this.context.subjectId)
    )
      return;
    this.observationFrame = requestAnimationFrame(() => {
      this.observationFrame = 0;
      if (this.closed) return;
      this.renderMetrics();
      this.renderMarket();
    });
  });
  constructor(
    readonly context: CardContext | null,
    private client: KosmoraClient,
    onRefresh: () => void,
    private onClose: () => void,
    private openSettings: (section?: "stat-boxes") => void,
    finishes: Finish[] = FINISHES,
    private onFinishesChange: (
      finishes: Finish[],
    ) => Promise<void> = async () => {},
    private settings: Settings = defaults(),
    placement?: PopupPlacement,
    private onPinChange: () => void = () => {},
    private onLayoutChange: (change: PopupLayoutChange) => void = () => {},
    private friendTooltip?: FriendTooltip,
    initialTab: PopupTab = "market",
    private browserZoom = 1,
  ) {
    this.displayedFinish = context ? finishOf(context.variant) : undefined;
    this.placement = placement ? { ...placement } : undefined;
    if (context)
      this.notes = new CardNotes(this.notesArea, context.subjectId, client);
    if (context)
      this.listingHistory = new ListingHistory(
        this.listingArea,
        context.subjectId,
        client,
        (busy) => {
          this.historyRefreshBusy = busy;
          this.updateRefreshButton();
        },
      );
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
    style.textContent =
      statCss + css + friendListCss + headerCss + SIGNAL_BADGE_CSS;
    this.shadow.append(style);
    const top = el("header", "top"),
      actions = el("div", "actions");
    actions.append(
      button(
        "",
        () =>
          this.selectedTab === "trade"
            ? this.refreshTradeFromCache()
            : this.selectedTab === "history"
              ? this.listingHistory?.refresh()
              : this.selectedTab === "notes"
                ? this.notes?.refresh()
                : onRefresh(),
        "icon refresh-button",
      ),
      this.pinButton,
      (this.closeButton = button("", onClose, "icon")),
    );
    const refreshButton = (this.refreshButton =
      actions.firstElementChild as HTMLButtonElement);
    refreshButton.append(headerIcon("refresh"));
    refreshButton.setAttribute("aria-label", "Refresh");
    refreshButton.title = "Refresh";
    actions.lastElementChild!.append(headerIcon("close"));
    (actions.lastElementChild as HTMLButtonElement).title =
      "Close KosMore popup";
    this.pinButton.append(pinIcon());
    this.renderPin();
    this.enableDragging(top);
    this.applySize();
    actions.lastElementChild!.setAttribute("aria-label", "Close KosMore popup");
    const titleRow = el("div", "title-row");
    titleRow.append(el("h2", "", context?.name ?? ""), actions);
    this.sellButton.setAttribute("aria-label", "Sell card");
    this.sellButton.title = "Loading owned copies…";
    this.sellButton.disabled = true;
    for (const [control, action] of [
      [this.giftButton, "Gift"],
      [this.tradeButton, "Trade"],
    ] as const) {
      control.setAttribute("aria-label", `${action} card`);
      control.title = "Loading owned copies…";
      control.disabled = true;
    }
    this.sellButton.append(cardIcon("sale", 20), el("span", "", "Sell"));
    this.tradeButton.prepend(cardIcon("trade", 20));
    this.giftButton.prepend(cardIcon("gift", 20));
    const titleActions = el("div", "title-actions");
    titleActions.append(this.headerSignals);
    const headerDetails = el("div", "header-details"),
      identity = el("div", "header-identity");
    this.familyBadges.setAttribute("role", "list");
    this.familyBadges.setAttribute("aria-label", "Card families");
    identity.append(
      el(
        "p",
        "subtitle",
        context
          ? `No. ${context.subjectId} · ${context.variant.fullArt ? "Full art" : context.variant.veil ? "Shiny" : "Standard"}`
          : "",
      ),
      this.familyBadges,
    );
    headerDetails.append(identity, titleActions);
    this.headerPrices.append(this.lastSold, this.listedFor);
    this.listedFor.setAttribute("role", "link");
    enableMarketLink(this.listedFor);
    top.append(titleRow, headerDetails, this.headerPrices);
    const tabs = el("div", "tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Card insights");
    const names = POPUP_TABS;
    const buttons = [
      this.marketTab,
      this.historyTab,
      this.tradeTab,
      this.notesTab,
    ];
    const panels = [
      this.market,
      this.listingArea,
      this.tradeArea,
      this.notesArea,
    ];
    for (const [index, tab] of buttons.entries()) {
      const panel = panels[index];
      tab.id = `kosmore-${names[index]}-tab`;
      panel.id = `kosmore-${names[index]}-panel`;
      tab.setAttribute("role", "tab");
      const label =
        names[index] === "history"
          ? "My listing history"
          : names[index][0].toUpperCase() + names[index].slice(1);
      tab.setAttribute("aria-label", label);
      tab.title = label;
      tab.append(tooltipIcon(names[index]));
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
    tabContent.append(
      this.market,
      this.listingArea,
      this.tradeArea,
      this.notesArea,
    );
    const tabWorkspace = el("div", "tab-workspace");
    tabWorkspace.append(tabs, tabContent);
    body.append(this.albumArea, this.statArea, tabWorkspace);
    const footer = el("footer", "footer");
    const settingsButton = (this.settingsButton = button(
      "",
      () => openSettings(),
      "settings-button",
    ));
    settingsButton.setAttribute("aria-label", "Settings");
    settingsButton.title = "Settings";
    settingsButton.append(tooltipIcon("settings"));
    const copyActions = el("div", "copy-actions");
    copyActions.append(this.sellButton, this.tradeButton, this.giftButton);
    footer.append(
      copyActions,
      el("span", "brand", "✦ KosMore"),
      settingsButton,
    );
    const empty = el("div", "empty-state", "No Card Selected");
    empty.setAttribute("role", "status");
    this.layoutStatus.setAttribute("role", "status");
    const content = el("div", "popup-content");
    content.append(top, empty, body, footer, this.layoutStatus);
    this.shadow.append(content);
    this.enableResizing(content);
    this.metrics.setAttribute("aria-live", "polite");
    this.albumArea.setAttribute("aria-live", "polite");
    this.tradeArea.setAttribute("aria-live", "polite");
    this.selectTab(this.placement?.tab ?? initialTab, false);
    if (context) {
      this.renderMetrics();
      this.renderHeaderPrices();
      this.renderMarket();
      this.renderAlbums();
    }
    (topDialog() ?? document.body).append(this.host);
    this.host.showPopover();
    if (context) this.albumVisibility.observe(this.albumArea);
    for (const event of [
      "pointerdown",
      "pointerup",
      "click",
      "auxclick",
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
    this.copyRequest?.abort();
    this.albumVisibility.disconnect();
    this.friendTooltip?.ownerDisposed(this.host);
    cancelAnimationFrame(this.marketFrame);
    cancelAnimationFrame(this.observationFrame);
    this.albumRequest?.abort();
    this.finishInteraction?.();
    this.closed = true;
    this.tradeRequest?.abort();
    this.auctionRequest?.abort();
    this.stopObservations();
    this.notes?.dispose();
    this.listingHistory?.dispose();
    this.reposition.disconnect();
    this.host.remove();
  }
  restoreCanceledWheel(event: WheelEvent) {
    if (!event.deltaY || event.ctrlKey || event.shiftKey) return;
    this.restoreCanceledScroll(event, event.deltaY, event.deltaMode);
  }
  restoreCanceledTouch(event: TouchEvent) {
    if (event.type === "touchstart") {
      this.scrollTouch =
        event.touches.length === 1 ? event.touches[0] : undefined;
      return;
    }
    if (event.type !== "touchmove" || event.touches.length !== 1) {
      this.scrollTouch = undefined;
      return;
    }
    const previous = this.scrollTouch;
    const touch = event.touches[0];
    if (touch.identifier !== previous?.identifier) return;
    this.scrollTouch = touch;
    const deltaY = previous.clientY - touch.clientY;
    if (Math.abs(deltaY) <= Math.abs(previous.clientX - touch.clientX)) return;
    this.restoreCanceledScroll(event, deltaY);
  }
  private restoreCanceledScroll(
    event: Event,
    deltaY: number,
    deltaMode: number = WheelEvent.DOM_DELTA_PIXEL,
  ) {
    const scrollers = event
      .composedPath()
      .filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement &&
          node.matches(".tab-content, .body, textarea") &&
          this.shadow.contains(node),
      );
    if (!scrollers.length) return;
    // The game's overlay can cancel scrolling before the event reaches the popup.
    // Check after dispatch so uncanceled gestures keep native scrolling.
    requestAnimationFrame(() => {
      if (!event.defaultPrevented || this.closed) return;
      for (const scroller of scrollers) {
        if (
          !scroller.isConnected ||
          scroller.scrollHeight <= scroller.clientHeight
        )
          continue;
        const unit =
          deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? scroller.clientHeight
            : deltaMode === WheelEvent.DOM_DELTA_LINE
              ? parseFloat(getComputedStyle(scroller).lineHeight) || 16
              : 1 / this.scale;
        const previous = scroller.scrollTop;
        scroller.scrollTop += deltaY * unit;
        if (scroller.scrollTop !== previous) break;
      }
    });
  }
  get isPinned() {
    return !!this.placement;
  }
  activateShortcut(action: HoverTooltipId): boolean {
    const controls = {
      close: this.closeButton,
      pin: this.pinButton,
      refresh: this.refreshButton,
      sell: this.sellButton,
      gift: this.giftButton,
      trade: this.tradeButton,
      settings: this.settingsButton,
      listedFor: this.listedFor,
      marketTab: this.marketTab,
      historyTab: this.historyTab,
      tradeTab: this.tradeTab,
      notesTab: this.notesTab,
    };
    let target: HTMLButtonElement | HTMLAnchorElement;
    if (
      action === "cycleTabs" ||
      action === "nextTab" ||
      action === "previousTab"
    ) {
      if (!this.context) return false;
      const current = POPUP_TABS.indexOf(this.selectedTab);
      const next =
        action === "cycleTabs"
          ? (current + 1) % POPUP_TABS.length
          : current + (action === "nextTab" ? 1 : -1);
      // Consume a boundary press so the tab strip's native arrow handling cannot wrap it.
      if (next < 0 || next >= POPUP_TABS.length) return true;
      target = controls[`${POPUP_TABS[next]}Tab`];
    } else target = controls[action];

    if (
      target.matches(':disabled, [aria-disabled="true"]') ||
      (target instanceof HTMLAnchorElement && !target.hasAttribute("href")) ||
      !target.getClientRects().length ||
      getComputedStyle(target).visibility !== "visible"
    )
      return false;
    const tabFocused = this.shadow.activeElement?.matches('[role="tab"]');
    target.click();
    if (tabFocused && target.matches('[role="tab"]'))
      target.focus({ preventScroll: true });
    return true;
  }
  activateAlbumShortcut(key: string): boolean {
    if (
      !this.account ||
      !this.context?.anchor.isConnected ||
      !this.settings.pinnedAlbumsEnabled
    )
      return false;
    const shortcuts = this.settings.pinnedAlbumHotkeys[this.account.key];
    if (!shortcuts) return false;
    const id = this.pinned.find((id) => {
      const binding = shortcuts[id];
      return binding && shortcutKey(binding) === key;
    });
    if (!id) return false;
    const target = this.albumArea.querySelector<HTMLButtonElement>(
      `.album-add[data-album-id="${CSS.escape(id)}"]`,
    );
    if (!target || target.disabled || this.albumArea.hidden) return false;
    target.click();
    return true;
  }
  pinnedPlacement(): PopupPlacement | undefined {
    return this.placement
      ? { ...this.placement, tab: this.selectedTab }
      : undefined;
  }
  setPinnedPlacement(position: PopupPosition | undefined) {
    const wasPinned = this.isPinned;
    this.placement = position ? { ...position, tab: this.selectedTab } : undefined;
    this.renderPin();
    this.position();
    if (this.isPinned !== wasPinned) this.onPinChange();
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
    this.saveLayout(this.isPinned);
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
      ? this.settings.fullScreenCenteredOnOpen
        ? "Unpin popup"
        : "Unpin popup · drag the header to move"
      : "Pin popup to keep it visible";
  }
  private get scale() {
    return tooltipScale(this.settings.tooltipUiScale, this.settings.lockTooltipToBrowserZoom, this.browserZoom);
  }
  setBrowserZoom(zoom: number) {
    if (zoom === this.browserZoom) return;
    if (this.settings.lockTooltipToBrowserZoom) this.finishInteraction?.();
    this.browserZoom = zoom;
    if (this.settings.lockTooltipToBrowserZoom) {
      this.applySize();
      this.position();
    }
  }
  private applySize() {
    this.host.toggleAttribute(
      "data-full-screen",
      this.settings.fullScreenCenteredOnOpen,
    );
    const viewport = this.visibleViewport();
    const scale = this.scale;
    this.host.style.setProperty("--popup-scale", String(scale));
    this.host.style.setProperty(
      "--popup-width",
      `${this.settings.fullScreenCenteredOnOpen ? Math.max(0, viewport.width - 48 * scale) : this.settings.popupWidth * scale}px`,
    );
    this.host.style.setProperty(
      "--popup-height",
      `${this.settings.fullScreenCenteredOnOpen ? Math.max(0, viewport.height - 48 * scale) : this.settings.popupHeight * scale}px`,
    );
  }
  private visibleViewport() {
    const viewport = window.visualViewport;
    return {
      width: viewport?.width ?? innerWidth,
      height: viewport?.height ?? innerHeight,
      left: viewport?.offsetLeft ?? 0,
      top: viewport?.offsetTop ?? 0,
    };
  }
  private saveLayout(pinned?: boolean) {
    if (this.settings.fullScreenCenteredOnOpen) {
      this.layoutStatus.textContent = "";
      if (pinned !== undefined) this.onLayoutChange({ pinned });
      return;
    }
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
      ...(pinned !== undefined ? { pinned } : {}),
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
  private enableResizing(content: HTMLElement) {
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
          popupWidth: Math.max(320, Math.round(bounds.width / this.scale)),
          popupHeight: Math.max(480, Math.round(bounds.height / this.scale)),
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
        if (this.settings.fullScreenCenteredOnOpen) return;
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
                scale: this.scale,
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
        if (this.settings.fullScreenCenteredOnOpen) return;
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
            { width: innerWidth, height: innerHeight, scale: this.scale },
          ),
        );
        finish();
      });
      content.append(handle);
    }
  }
  private enableDragging(header: HTMLElement) {
    let drag:
      | { id: number; x: number; y: number; left: number; top: number }
      | undefined;
    header.addEventListener("pointerdown", (event) => {
      if (
        this.settings.fullScreenCenteredOnOpen ||
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
      const gap = 12 * this.scale;
      this.placement.left = Math.max(
        gap,
        Math.min(
          drag.left + event.clientX - drag.x,
          innerWidth - this.host.offsetWidth - gap,
        ),
      );
      this.placement.top = Math.max(
        gap,
        Math.min(
          drag.top + event.clientY - drag.y,
          innerHeight - this.host.offsetHeight - gap,
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
    const gap = 12 * this.scale;
    this.host.toggleAttribute("data-compact", innerHeight / this.scale <= 740);
    if (this.settings.fullScreenCenteredOnOpen) {
      this.applySize();
      const viewport = this.visibleViewport();
      this.host.style.left = `${viewport.left + (viewport.width - this.host.offsetWidth) / 2}px`;
      this.host.style.top = `${viewport.top + (viewport.height - this.host.offsetHeight) / 2}px`;
      return;
    }
    if (this.resizeBounds) {
      this.host.style.left = `${this.resizeBounds.left}px`;
      this.host.style.top = `${this.resizeBounds.top}px`;
      return;
    }
    if (this.placement) {
      const left = Math.max(
        gap,
        Math.min(this.placement.left, innerWidth - this.host.offsetWidth - gap),
      );
      const top = Math.max(
        gap,
        Math.min(this.placement.top, innerHeight - this.host.offsetHeight - gap),
      );
      this.host.style.left = `${left}px`;
      this.host.style.top = `${top}px`;
      return;
    }
    if (!this.context) return;
    const r = this.context.anchor.getBoundingClientRect(),
      w = this.host.offsetWidth,
      h = this.host.offsetHeight;
    let left = r.right + gap;
    if (left + w > innerWidth - gap) left = r.left - w - gap;
    if (left < gap) left = Math.max(gap, Math.min(r.left, innerWidth - w - gap));
    const top = Math.max(gap, Math.min(r.top, innerHeight - h - gap));
    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
  }
  setInsights(details: CardInsights, fresh = false) {
    if (!this.context) return;
    this.details = details;
    this.insightError = undefined;
    const sub = this.shadow.querySelector(".subtitle");
    if (sub)
      sub.textContent = `${details.rarity} · No. ${details.subjectId} · ${this.context.variant.fullArt ? "Full art" : this.context.variant.veil ? "Shiny" : "Standard"}`;
    this.familyBadges.replaceChildren(
      ...(details.families ?? []).map((family) => {
        const item = el("span");
        item.setAttribute("role", "listitem");
        const badge = el("a", "family-badge", family.name);
        badge.href = `/families/${encodeURIComponent(family.id)}`;
        badge.title = `View ${family.name} in your collection`;
        item.append(badge);
        return item;
      }),
    );
    this.renderMetrics();
    this.renderAlbums();
    this.refreshTrade();
    void this.loadActiveAuctions(fresh);
  }
  refreshAccountPrice() {
    if (this.activeAuctions) void this.loadActiveAuctions(true);
  }
  private async loadActiveAuctions(fresh = false) {
    if (this.closed || !this.details || !this.displayedFinish) return;
    if (!fresh && (this.auctionRequest || this.activeAuctions !== undefined))
      return;
    this.auctionRequest?.abort();
    const request = new AbortController();
    this.auctionRequest = request;
    setRequestPriority(request.signal, "interactive");
    this.showCachedAuction(fresh);
    try {
      const count = await this.client.activeAuctions(
        this.details.subjectId,
        this.displayedFinish,
        request.signal,
        fresh,
      );
      if (this.closed || request.signal.aborted) return;
      this.activeAuctions = count;
      if (count === 0) {
        this.lowestListing = null;
        this.listingPriceStale = false;
      } else {
        try {
          const listing = await this.client.lowestListing(
            this.details.subjectId,
            this.displayedFinish,
            request.signal,
          );
          if (!this.closed && !request.signal.aborted) {
            if (listing !== undefined || !this.listingPriceStale)
              this.lowestListing =
                listing ?? new Error("The lowest listing price is unavailable.");
            if (listing !== undefined)
              this.listingPriceStale = !!this.client.peekAuction?.(
                this.details.subjectId,
                this.displayedFinish,
              )?.stale;
          }
        } catch (error) {
          if (
            !this.closed &&
            !request.signal.aborted &&
            !this.listingPriceStale
          )
            this.lowestListing = new Error(messageOf(error));
        }
      }
    } catch (error) {
      if (!this.closed && !request.signal.aborted) {
        this.activeAuctions = new Error(messageOf(error));
        if (!this.listingPriceStale)
          this.lowestListing = new Error(messageOf(error));
      }
    } finally {
      if (this.auctionRequest === request) {
        this.auctionRequest = undefined;
        if (!this.closed) {
          this.renderMetrics();
          this.renderHeaderSignals();
          this.renderHeaderPrices();
        }
      }
    }
  }
  showCachedAuction(fresh = false) {
    if (!this.context || !this.displayedFinish) return;
    const hit = this.client.peekAuction?.(
      this.context.subjectId,
      this.displayedFinish,
    );
    if (
      hit &&
      Date.now() - hit.until < 86_400_000 &&
      hit.value.lowestListing !== undefined
    ) {
      this.lowestListing = hit.value.lowestListing;
      this.listingPriceStale = fresh || hit.stale;
      this.renderHeaderPrices();
    }
  }
  insightsFailed(error: unknown) {
    this.insightError = error instanceof Error ? error : new Error(messageOf(error));
    if (this.lowestListing === undefined)
      this.lowestListing = this.insightError;
    this.renderHeaderPrices();
    this.renderMetrics();
    if (!this.account && !this.missingNumberOne) this.notes?.failed(error);
    this.renderTrade();
  }
  setHistory(finish: Finish, result: MarketHistory | Error, stale = false) {
    const previous = this.histories[finish];
    if (
      result instanceof Error &&
      this.staleHistories.has(finish) &&
      previous &&
      !(previous instanceof Error) &&
      previous.sales.length
    )
      return;
    if (stale) this.staleHistories.add(finish);
    else this.staleHistories.delete(finish);
    if (this.context?.numberOne && result instanceof CardNotFoundError)
      result = {
        finish,
        days: 30,
        count: 0,
        sales: [],
        complete: true,
        low: null,
        median: null,
        high: null,
      };
    this.histories[finish] = result;
    this.renderMarket();
  }
  setFinishes(finishes: Finish[]) {
    this.hidden = new Set(FINISHES.filter((f) => !finishes.includes(f)));
    this.renderMarket();
  }
  private updateRefreshButton() {
    const history = this.selectedTab === "history";
    const label = history ? LISTING_REFRESH_LABEL : "Refresh";
    this.refreshButton.title = label;
    this.refreshButton.setAttribute("aria-label", label);
    this.refreshButton.disabled = history && this.historyRefreshBusy;
  }
  setAccount(account: Account, pinned: string[], fresh = false) {
    if (this.account?.key !== account.key) this.cachedTradeFriends = undefined;
    this.account = account;
    this.notes?.setAccount(account);
    this.listingHistory?.setAccount(account);
    this.pinned = pinned;
    void this.loadCopies();
    this.renderAlbums();
    this.albumRefresh = fresh;
    void this.loadAlbums();
    this.refreshTrade();
  }
  private refreshTradeFromCache() {
    const friends = this.cachedTradeFriends,
      account = this.account,
      families = this.details?.families;
    if (!friends || !account || !families?.length) return;
    void readTradeMatches(account.key, families, friends)
      .then((result) => {
        if (
          this.closed ||
          this.account !== account ||
          this.cachedTradeFriends !== friends
        )
          return;
        this.tradeResult = result;
        this.renderTrade();
      })
      .catch(() => {});
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
  get usesPrivateData() {
    return !!this.account;
  }

  async loadPrivateAccount() {
    if (!this.context || this.closed) return;
    try {
      const account = await this.client.account(undefined, false);
      if (!this.closed)
        this.setAccount(account, this.settings.pinnedAlbums[account.key] ?? []);
    } catch (error) {
      if (!this.closed) this.albumsFailed(error);
    }
  }

  private selectTab(tab: PopupTab, remember = true) {
    this.selectedTab = tab;
    if (tab !== "market" && !this.account) void this.loadPrivateAccount();
    if (remember) this.onLayoutChange({ tab });
    this.market.hidden = tab !== "market";
    this.listingArea.hidden = tab !== "history";
    this.tradeArea.hidden = tab !== "trade";
    this.notesArea.hidden = tab !== "notes";
    for (const [name, button] of [
      ["market", this.marketTab],
      ["history", this.historyTab],
      ["trade", this.tradeTab],
      ["notes", this.notesTab],
    ] as const) {
      button.setAttribute("aria-selected", String(name === tab));
      button.tabIndex = name === tab ? 0 : -1;
    }
    if (tab === "market") this.renderMarket();
    if (tab === "trade") void this.loadTrade();
    if (tab === "notes") this.notes?.activate();
    this.listingHistory?.setActive(tab === "history");
    this.updateRefreshButton();
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
      const friends = (await hasFriendInterests(accountKey))
        ? await this.client.friends(request.signal, fresh)
        : [];
      if (!valid()) return;
      this.cachedTradeFriends = friends;
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
  invalidateListingHistory() {
    this.listingHistory?.invalidate();
  }
  private renderTrade() {
    const area = this.tradeArea;
    area.replaceChildren(this.heading("Friends who may be interested"));
    if (this.insightError) {
      area.append(note(this.insightError.message, !this.missingNumberOne));
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
      this.tradeFriends.setData(result.matches);
      area.append(this.tradeFriends.element);
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
  private async loadCopies() {
    if (!this.context || !this.account || this.closed) return;
    const pinned = this.settings.pinnedAlbumsEnabled && this.pinned.length > 0;
    const scope = this.account.key + ":" + pinned;
    if (scope === this.copyScope) return;
    this.copyScope = scope;
    this.copyRequest?.abort();
    const request = new AbortController();
    this.copyRequest = request;
    setRequestPriority(request.signal, "interactive");
    this.copiesResolved = false;
    this.ownedCopies = undefined;
    this.chosen = undefined;
    this.copyProblem = undefined;
    try {
      const result = await this.client.tooltipCopies(
        this.context,
        this.account.key,
        pinned,
        request.signal,
      );
      if (request.signal.aborted) return;
      const { copies, chosen: matched } = result;
      this.ownedCopies = matched && copies && copies[0]?.id !== matched.id
        ? [matched, ...copies.filter(copy => copy.id !== matched.id)]
        : copies;
      this.chosen = this.ownedCopies?.[0];
      this.copyProblem = result.problem;
    } catch (error) {
      if (request.signal.aborted) return;
      this.copyProblem = messageOf(error);
    }
    this.copiesResolved = true;
    this.renderAlbums();
    void this.loadAlbums();
  }
  setAlbums(account: Account, albums: Album[], pinned: string[]) {
    this.account = account;
    this.albums = albums;
    this.pinned = pinned;
    this.albumError = undefined;
    this.renderAlbums();
  }
  private async loadAlbums() {
    const fresh = this.albumRefresh;
    if (
      !this.context ||
      !this.account ||
      !this.settings.pinnedAlbumsEnabled ||
      !this.albumVisible ||
      !this.copiesResolved ||
      !this.ownedCopies?.length ||
      !this.pinned.length ||
      this.albumRequest ||
      (!fresh && this.albums)
    )
      return;
    this.albumRefresh = false;
    const request = new AbortController(),
      account = this.account;
    this.albumRequest = request;
    setRequestPriority(request.signal, "interactive");
    try {
      const albums = await this.client.albums(
        this.context.subjectId,
        request.signal,
        fresh,
      );
      if (!this.closed && !request.signal.aborted && this.account === account)
        this.setAlbums(account, albums, this.pinned);
    } catch (error) {
      if (!this.closed && !request.signal.aborted) this.albumsFailed(error);
    } finally {
      if (this.albumRequest === request) {
        this.albumRequest = undefined;
        if (request.signal.aborted && this.albumVisible && !this.closed)
          void this.loadAlbums();
      }
    }
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
  setStatSettings(settings: Settings) {
    this.settings = {
      ...this.settings,
      stats: settings.stats,
      statBoxesEnabled: settings.statBoxesEnabled,
    };
    this.renderMarket();
  }
  setSettings(settings: Settings) {
    if (settings.fullScreenCenteredOnOpen || tooltipScale(settings.tooltipUiScale, settings.lockTooltipToBrowserZoom, this.browserZoom) !== this.scale)
      this.finishInteraction?.();
    if (this.resizeBounds) {
      this.settings = {
        ...settings,
        popupWidth: this.settings.popupWidth,
        popupHeight: this.settings.popupHeight,
      };
      return;
    }
    this.settings = settings;
    if (!settings.pinnedAlbumsEnabled) this.albumRequest?.abort();
    this.renderPin();
    this.applySize();
    this.position();
    if (!this.context) return;
    this.renderMarket();
    if (this.account)
      this.pinned = settings.pinnedAlbums[this.account.key] ?? [];
    else if (
      settings.pinnedAlbumsEnabled &&
      Object.values(settings.pinnedAlbums).some((ids) => ids.length)
    )
      void this.loadPrivateAccount();
    void this.loadCopies();
    this.renderAlbums();
    this.renderHeaderSignals();
    void this.loadAlbums();
    void this.loadActiveAuctions();
  }
  setSignals(signals?: CardSignals) {
    this.signals = signals;
    this.renderHeaderSignals();
  }
  private renderHeaderSignals() {
    this.headerSignals.replaceChildren(
      ...(this.signals
        ? signalBadges(
            this.signals,
            this.settings,
            false,
            undefined,
            this.context &&
              this.settings.socialEnabled &&
              this.settings.friendTooltipEnabled &&
              this.friendTooltip
              ? (badge) =>
                  this.friendTooltip!.bind(
                    badge,
                    this.context!.subjectId,
                    this.host,
                  )
              : undefined,
          ).filter((badge) => badge.matches(".friend,.quest"))
        : []),
    );
  }
  private renderMetrics() {
    const definitions = this.settings.statBoxesEnabled
      ? visibleStats(this.settings.stats)
      : [];
    this.statArea.hidden = !definitions.length;
    this.metricError.textContent = this.missingNumberOne
      ? ""
      : this.insightError?.message ?? "";
    if (!definitions.length) {
      this.metrics.replaceChildren();
      return;
    }
    const snapshot = statSnapshot(
      this.details,
      definitions.some((d) => d.source === "prices" || d.source === "sales")
        ? this.histories
        : {},
      FINISHES.filter((f) => !this.hidden.has(f)),
      this.insightError?.message,
      this.activeAuctions,
      definitions.some((d) => d.id === "saleRate")
        ? this.saleRates()
        : undefined,
    );
    this.metrics.replaceChildren(
      ...definitions.map((d) => statBox(d, d.read(snapshot))),
    );
    this.priceScope.textContent = definitions.some((d) => d.source === "prices")
      ? snapshot.priceNotice
      : "";
  }
  private renderMarket() {
    if (this.marketFrame || this.closed) return;
    this.marketFrame = requestAnimationFrame(() => {
      this.marketFrame = 0;
      if (this.closed) return;
      this.renderMetrics();
      this.renderHeaderPrices();
      if (this.selectedTab === "market") this.renderMarketNow();
    });
  }
  private renderMarketNow() {
    const allEmpty = FINISHES.every((finish) => {
      const h = this.histories[finish];
      return h && !(h instanceof Error) && h.count === 0;
    });
    this.market.toggleAttribute("data-empty-history", allEmpty);
    const noHistory = () => {
      const empty = el("div", "no-market-history");
      empty.setAttribute("role", "status");
      empty.append(el("strong", "", "No Market History"));
      return empty;
    };
    if (allEmpty) {
      this.market.replaceChildren(noHistory());
      return;
    }
    const legend = this.marketLegend ?? el("div", "legend");
    if (!this.marketLegend)
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
    this.marketLegend = legend;
    for (const [i, finish] of FINISHES.entries())
      legend.querySelectorAll<HTMLInputElement>("input")[i].checked =
        !this.hidden.has(finish);
    if (!legend.isConnected)
      this.market.replaceChildren(
        this.heading("Market history", "30-day window"),
        legend,
        this.filterStatus,
        this.marketBody,
      );
    this.marketBody.replaceChildren();
    const selected = FINISHES.filter((f) => !this.hidden.has(f));
    if (
      selected.length &&
      selected.every((f) => {
        const h = this.histories[f];
        return h && !(h instanceof Error) && h.count === 0;
      })
    ) {
      this.marketBody.append(noHistory());
      return;
    }
    this.renderMarketHistory();
  }
  private renderHeaderPrices() {
    const marketName = this.details?.name ?? this.context?.name;
    const finish = this.displayedFinish;
    if (!finish) return;
    const history = this.histories[finish];
    const useMedian = this.settings.useMedianOverlayPrice;
    const sale = salePriceSummary(history, useMedian);
    this.lastSold.setAttribute("aria-disabled", String(!sale.label));
    this.lastSold.replaceChildren(
      cardIcon("sale"),
      el("span", "market-badge-label", sale.label ?? (useMedian ? "Median: -" : "Last Sale: -")),
    );
    if (sale.numberOne) this.lastSold.append(numberOneIcon());
    const saleStale = this.staleHistories.has(finish);
    this.lastSold.toggleAttribute("data-stale-price", saleStale);
    this.lastSold.title =
      sale.title + (saleStale ? " Last known price." : "");
    const listing = this.lowestListing;
    const price = listing && !(listing instanceof Error) ? listing : undefined;
    if (price && marketName) this.listedFor.href = marketSearchPath(marketName);
    else this.listedFor.removeAttribute("href");
    this.listedFor.setAttribute("aria-disabled", String(!this.listedFor.hasAttribute("href")));
    const bids = price && this.settings.showAuctionBidCounts
      ? auctionBidSuffix(price.bids)
      : "";
    const label = price ? `$${formatKosmo(price.price)}` : "-";
    this.listedFor.replaceChildren(
      auctionIcon(bids ? price?.bids : undefined),
      el("span", "market-badge-label", `Listed For: ${label}`),
    );
    this.listedFor.title =
      listing instanceof Error
        ? listing.message
        : listing === null
          ? "No active listings for this card."
          : listing === undefined
            ? "Loading the lowest listing price."
            : `Lowest observed auction price for ${FINISH_LABEL[finish]}: ${formatKosmo(listing.price)} Kosmo${bids}.`;
    this.listedFor.toggleAttribute("data-stale-price", this.listingPriceStale);
    if (this.listingPriceStale)
      this.listedFor.title = "Last known lowest listing price.";
    this.listedFor.title += highlightOwnPrice(this.listedFor, price, this.listingPriceStale);
    const fetchedAt =
      this.context &&
      this.client.peekAuction?.(this.context.subjectId, finish)?.fetchedAt;
    if (fetchedAt)
      this.listedFor.title +=
        " Provider snapshot fetched " +
        new Date(fetchedAt).toLocaleTimeString() +
        ". Auction prices are delayed five minutes.";
    if (price && marketName) this.listedFor.title += ` Find ${marketName} at Market.`;
    this.listedFor.setAttribute("aria-label", `Listed For: ${label}${bids}. ${this.listedFor.title}`);
  }
  private saleRates(): SaleRates | undefined {
    if (!this.context) return;
    const id = this.context.subjectId;
    const cached = Object.fromEntries(
      FINISHES.map((finish) => {
        const history = this.histories[finish];
        return [
          finish,
          {
            history:
              history && !(history instanceof Error)
                ? history
                : this.client.peekHistory?.(id, finish)?.value,
            open: this.client.peekAuction?.(id, finish)?.value.count,
          },
        ];
      }),
    );
    return saleRates(saleObservations.observations, id, Date.now(), cached);
  }
  private renderMarketHistory() {
    const available = FINISHES.filter((f) => !this.hidden.has(f)).flatMap(
      (f) => {
        const h = this.histories[f];
        return h && !(h instanceof Error) ? [h] : [];
      },
    );
    const days = available
      .flatMap(dailySalePrices)
      .sort((a, b) => b.day.localeCompare(a.day));
    if (days.length) this.marketBody.append(this.chart(days));
    const table = el("table", "stats");
    table.setAttribute("aria-label", "Market summaries by variant");
    const head = el("tr");
    for (const title of ["Variant", "Sales", "Min", "Median", "Max", "Sold"])
      head.append(el("th", "", title));
    const rates = this.saleRates();
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
      // Sell-through comes from local observations, independent of the history read.
      const rate = rates?.[f];
      const sold = el(
        "td",
        "sale-rate",
        rate?.percent == null ? "—" : `${rate.percent}% (${rate.total})`,
      );
      sold.title = rate?.total
        ? `Estimated from cached ${FINISH_LABEL[f]} sales and listings: ${rate.sold} of ${rate.total} sold.`
        : "No cached sales or listings for this finish.";
      row.append(sold);
      tbody.append(row);
    }
    table.append(tbody);
    this.marketBody.append(table);
    for (const f of FINISHES) {
      if (this.hidden.has(f)) continue;
      const h = this.histories[f];
      if (h instanceof Error)
        this.marketBody.append(note(`${FINISH_LABEL[f]}: ${h.message}`, true));
    }
    if (
      available.some((h) => !h.complete && !h.daily?.length && h.sales.length)
    )
      this.marketBody.append(
        note(
          "For variants with sampled sales, the chart and daily prices cover the returned sample.",
        ),
      );
    if (!days.length) {
      if (available.length)
        this.marketBody.append(
          note(
            available.some((h) => h.count || h.lastSale)
              ? "Daily sale prices are unavailable for the selected variants."
              : "No completed sales in the available variant histories.",
          ),
        );
      return;
    }
    const daily = el("table", "daily-prices");
    daily.setAttribute("aria-label", "Daily sale prices by variant in Kosmo");
    const headers = daily.createTHead().insertRow();
    for (const title of [
      "Day (UTC)",
      "Variant",
      "Sales",
      "Min",
      "Median",
      "Max",
    ]) {
      const th = el("th", "", title);
      th.scope = "col";
      headers.append(th);
    }
    const formatDay = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    let group: HTMLTableSectionElement;
    for (const [index, prices] of days.entries()) {
      const row = el("tr");
      if (prices.day !== days[index - 1]?.day) {
        group = daily.createTBody();
        const dateHeader = el("th");
        dateHeader.scope = "rowgroup";
        dateHeader.rowSpan = 0;
        const time = el(
          "time",
          "",
          formatDay.format(new Date(prices.day + "T00:00:00Z")),
        );
        time.dateTime = prices.day;
        dateHeader.append(time);
        row.append(dateHeader);
      }
      const key = prices.day + "/" + prices.finish;
      row.dataset.dailyRow = key;
      row.toggleAttribute("data-selected", this.selectedDay === key);
      const variant = el(
        "button",
        "daily-variant",
        FINISH_LABEL[prices.finish],
      );
      variant.type = "button";
      variant.setAttribute(
        "aria-label",
        "Highlight " +
          prices.day +
          " " +
          FINISH_LABEL[prices.finish] +
          " on chart",
      );
      const cell = el("td");
      cell.append(variant);
      row.append(cell);
      row.addEventListener("click", () => this.selectDay(key, "point"));
      for (const value of [
        prices.count.toLocaleString(),
        prices.min,
        prices.median,
        prices.max,
      ])
        row.append(el("td", "", value));
      group!.append(row);
    }
    this.marketBody.append(this.heading("Daily sale prices", "Kosmo"), daily);
  }
  private selectDay(key: string, target: "point" | "row") {
    this.selectedDay = key;
    for (const element of this.marketBody.querySelectorAll<
      HTMLElement | SVGCircleElement
    >("[data-daily-point],[data-daily-row]")) {
      const selected =
        (element.dataset.dailyPoint ?? element.dataset.dailyRow) === key;
      element.toggleAttribute("data-selected", selected);
      if (element.dataset.dailyPoint)
        element.setAttribute("aria-pressed", String(selected));
      if (!selected) continue;
      const focus =
        target === "point"
          ? element.dataset.dailyPoint
            ? element
            : undefined
          : element.querySelector<HTMLButtonElement>(".daily-variant");
      if (focus) {
        focus.focus({ preventScroll: true });
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  }
  private chart(days: DailySalePrice[]) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 400 130");
    svg.classList.add("chart");
    svg.setAttribute("role", "group");
    svg.setAttribute(
      "aria-label",
      "Daily median sale prices by finish. Select a point to see its history row.",
    );
    // Use seven decimal places to retain half-micro medians.
    const median = (day: DailySalePrice) => {
      const [whole, fraction = ""] = day.median.replaceAll(",", "").split(".");
      return BigInt(whole + fraction.padEnd(7, "0"));
    };
    const values = days.map(median);
    const low = values.reduce((a, b) => (a < b ? a : b));
    const high = values.reduce((a, b) => (a > b ? a : b));
    const range = high - low || 1n;
    const span = 29 * 86_400_000;
    const start = Date.parse(new Date().toISOString().slice(0, 10)) - span;
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
    for (const finish of FINISHES) {
      const points = days
        .filter((day) => day.finish === finish)
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((day) => ({
          day,
          x:
            12 +
            Math.max(0, Math.min(1, (Date.parse(day.day) - start) / span)) *
              376,
          y: 90 - Number(((median(day) - low) * 70000n) / range) / 1000,
        }));
      if (!points.length) continue;
      const path = document.createElementNS(svg.namespaceURI, "polyline");
      path.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", COLORS[finish]);
      path.setAttribute("stroke-opacity", ".65");
      svg.append(path);
      for (const p of points) {
        const circle = document.createElementNS(svg.namespaceURI, "circle");
        circle.setAttribute("cx", String(p.x));
        circle.setAttribute("cy", String(p.y));
        circle.setAttribute("r", "5.5");
        circle.setAttribute("fill", COLORS[finish]);
        const title = document.createElementNS(svg.namespaceURI, "title");
        const { day, count, min, average, max } = p.day;
        const key = day + "/" + finish;
        const date = day.slice(8) + "/" + day.slice(5, 7);
        const label = [
          date,
          "Sales " + count,
          "Min $" + min,
          "Avg " + (average === undefined ? "—" : "$" + average),
          "Max $" + max,
          FINISH_LABEL[finish],
        ].join(" - ");
        title.textContent = label;
        circle.setAttribute("data-daily-point", key);
        circle.toggleAttribute("data-selected", key === this.selectedDay);
        circle.setAttribute("role", "button");
        circle.setAttribute("aria-pressed", String(key === this.selectedDay));
        circle.setAttribute("tabindex", "0");
        circle.setAttribute("aria-label", label);
        circle.addEventListener("click", () => this.selectDay(key, "row"));
        circle.addEventListener("keydown", (event: Event) => {
          const keyEvent = event as KeyboardEvent;
          if (keyEvent.key === "Enter" || keyEvent.key === " ") {
            keyEvent.preventDefault();
            this.selectDay(key, "row");
          }
        });
        circle.append(title);
        svg.append(circle);
      }
    }
    for (const [x, text] of [
      [12, "Last 30 days"],
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
    const showAlbums = this.settings.pinnedAlbumsEnabled;
    area.hidden = !showAlbums;
    area.replaceChildren(
      ...(showAlbums ? [this.heading("Pinned albums")] : []),
    );
    this.renderSell();
    if (!this.account) {
      if (showAlbums)
        area.append(
          note(
            this.albumError ??
              "Open this card in Kosmora to verify your copies.",
            !!this.albumError,
          ),
        );
      return;
    }
    const copies = this.ownedCopies ?? [];
    if (this.copyProblem && !this.chosen)
      area.append(note(this.copyProblem, true));
    if (!copies.length) {
      if (showAlbums && !this.copyProblem)
        area.append(
          note(
            !this.copiesResolved
              ? "Loading owned copies…"
              : this.ownedCopies
                ? "Own a copy of this card to add it to an album."
                : "Open this card in Kosmora to verify your copies.",
          ),
        );
      return;
    }
    if (!this.copiesResolved) {
      if (showAlbums) area.append(note("Identifying the owned copy…"));
      return;
    }
    if (copies.length > 1 || this.copyProblem) {
      area.hidden = false;
      const label = el("label", "copy-label", "Choose an owned copy");
      const select = el("select");
      select.setAttribute("aria-label", "Owned copy");
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
    if (!showAlbums) return;
    const selected = this.selectedCopy();
    if (!this.pinned.length) {
      area.append(
        note("Pin the albums you use most for quick access."),
        button("Choose pinned albums", () => this.openSettings(), "link"),
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
      const tile = el("div", "album-tile");
      const b = button("", () => void this.add(id, selected), "album-add");
      b.dataset.albumId = id;
      const albumName = album?.name ?? "Album unavailable";
      b.append(el("span", "album-name", albumName));
      b.title = albumName;
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
      tile.append(b);
      if (album?.contains) {
        const remove = button("", () => void this.remove(id), "album-remove");
        remove.setAttribute("aria-label", `Remove from ${album.name}`);
        remove.title = `Remove this card from ${album.name}`;
        remove.disabled = this.pending;
        const trash = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        for (const [key, value] of Object.entries({
          viewBox: "0 0 24 24",
          width: "14",
          height: "14",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "1.8",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "aria-hidden": "true",
        }))
          trash.setAttribute(key, value);
        const path = document.createElementNS(trash.namespaceURI, "path");
        path.setAttribute(
          "d",
          "M3 6h18 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14 M10 10v7 M14 10v7",
        );
        trash.append(path);
        remove.append(trash);
        tile.append(remove);
      }
      grid.append(tile);
    }
    area.append(grid, this.status);
  }
  private selectedCopy(): OwnedCopy | undefined {
    if (!this.copiesResolved) return undefined;
    const copies = this.ownedCopies ?? [];
    return (
      this.chosen ??
      (!this.copyProblem && copies.length === 1 ? copies[0] : undefined)
    );
  }
  private renderSell() {
    const copy = this.selectedCopy();
    this.sellButton.disabled =
      !copy ||
      copy.state !== "available" ||
      this.pending ||
      this.openingCopyAction;
    const loading =
      !this.copiesResolved && (!!this.copyRequest || !this.details);
    this.sellButton.title = loading
      ? "Loading owned copies…"
      : !this.ownedCopies
        ? "Open this card in Kosmora to verify ownership."
        : !this.ownedCopies.length
          ? "Own a copy of this card to sell it."
          : !copy
            ? "Choose an owned copy below to sell it."
            : copy.state !== "available"
              ? "This copy is not available to sell."
              : "Open the sell form for this owned copy";
    for (const [action, control] of [
      ["gift", this.giftButton],
      ["trade", this.tradeButton],
    ] as const) {
      const problem = loading
        ? "Loading owned copies…"
        : !this.ownedCopies
          ? "Open this card in Kosmora to verify ownership."
          : !this.ownedCopies.length
            ? `Own a copy of this card to ${action} it.`
            : !copy
              ? `Choose an owned copy to ${action} it.`
              : transferProblem(copy, action);
      control.disabled =
        !!problem || !this.account || this.pending || this.openingCopyAction;
      control.title = problem ?? `Open the ${action} form for this owned copy`;
    }
  }
  private async openCopyAction(action: "sell" | TransferAction) {
    if (!this.context) return;
    const copy = this.selectedCopy();
    if (!copy || !this.account || this.openingCopyAction || this.pending)
      return;
    const accountKey = this.account.key;
    const sourceUrl = location.href;
    this.openingCopyAction = true;
    this.status.className = "album-status";
    this.status.textContent = `Opening ${action} form…`;
    if (!this.status.isConnected) this.albumArea.append(this.status);
    this.renderSell();
    try {
      const owned = await this.client.verifiedCopy(
        this.context.subjectId,
        copy.id,
        accountKey,
      );
      if (action === "sell" && owned.state !== "available")
        throw new Error("This copy is no longer available to sell.");
      if (action !== "sell") {
        const problem = transferProblem(owned, action);
        if (problem) throw new Error(problem);
      }
      // The click requests navigation independently of the hover popup's lifetime.
      // Respect a later page navigation while the ownership check was pending.
      if (location.href === sourceUrl) {
        const path =
          action === "sell"
            ? sellPath(owned)
            : action === "trade"
              ? tradePath(owned)
              : giftPath(owned, accountKey);
        location.assign(path);
      }
    } catch (error) {
      this.status.className = "album-status error";
      this.status.textContent = messageOf(error);
    } finally {
      this.openingCopyAction = false;
      if (!this.closed) this.renderSell();
    }
  }
  private async remove(id: string) {
    if (
      !this.settings.pinnedAlbumsEnabled ||
      !this.context ||
      !this.account ||
      this.pending
    )
      return;
    this.pending = true;
    this.status.className = "album-status";
    this.status.textContent = "Removing from album…";
    this.renderAlbums();
    try {
      await this.client.remove(id, this.context.subjectId, this.account.key);
      if (this.closed) return;
      this.albums = await this.client.albums(this.context.subjectId);
      this.status.textContent = "Removed from album.";
    } catch (error) {
      this.status.className = "album-status error";
      this.status.textContent = messageOf(error);
      try {
        this.albums = await this.client.albums(this.context.subjectId);
      } catch {
        /* Keep the previous membership visible until it can be checked. */
      }
    } finally {
      this.pending = false;
      if (!this.closed) this.renderAlbums();
    }
  }
  private async add(id: string, copy?: OwnedCopy) {
    if (!this.settings.pinnedAlbumsEnabled || !this.context) return;
    if (!copy || !this.account || this.pending) return;
    this.pending = true;
    this.status.className = "album-status";
    this.status.textContent = "Adding to album…";
    this.renderAlbums();
    try {
      await this.client.add(id, copy, this.account.key);
      // An add may finish after this popup was replaced by another card.
      if (this.closed) return;
      if (
        this.settings.closeTooltipWhenAddedToAlbum &&
        (!this.isPinned || this.settings.applyCloseBehaviorToPinnedTooltips)
      ) {
        this.onClose();
        return;
      }
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
