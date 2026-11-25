import {
  cardOverlayTargets,
  cardOverlaysAllowed,
  contextKey,
  isFusionPage,
  OVERLAY_ATTR,
  resolveCard,
} from "../kosmora/dom";
import { ApiError } from "../kosmora/client";
import { settingMicros } from "../shared/sales-prices";
import { finishOf } from "../shared/sale-observations";
import type { CardContext, KosmoraClient, Settings } from "../shared/types";
import { settingsForPage } from "../shared/page-settings";
import {
  CardSignalProvider,
  overlaySalePrice,
  sameOverlaySignals,
  type CardSignals,
} from "./card-signals";
import { SIGNAL_BADGE_CSS, signalBadges } from "./signal-badges";
import { auctionIcon } from "./icons";
import { isolateMarketControl } from "./market-links";
import { el } from "./ui";
import { observePage, affected, type PageChanges } from "./page-changes";
import { packSummaryStatus } from "./pack-summary-status";
interface OverlayPosition {
  element: HTMLElement;
  value: string;
  priority: string;
}
interface Entry {
  root: HTMLElement;
  context: CardContext;
  key: string;
  visible: boolean;
  done: boolean;
  hasRenderedResult?: boolean;
  request?: AbortController;
  signals?: CardSignals;
  host?: HTMLElement;
  positioned?: OverlayPosition;
  albumSale?: { host: HTMLElement; positioned?: OverlayPosition };
  saleLabel?: HTMLElement;
}
const FUSION_WARNING = "data-kosmore-fusion-price-warning";
const PACK_WARNING = "data-kosmore-pack-price-warning";

export function priceWarningForPage(settings?: Settings, pathname = location.pathname) {
  if (isFusionPage(pathname) && settings?.fusionSettingsEnabled && settings.fusionShowPriceWarning) return FUSION_WARNING;
  if (pathname === "/packs/open" && settings?.packOpeningsEnabled && settings.packShowPriceWarning) return PACK_WARNING;
}
const OFFSCREEN_PAUSE_MS = 50;
const HOST_STYLE = `
:host{all:initial;position:absolute;inset:6px;container-type:inline-size;z-index:20;pointer-events:none;user-select:none;font:600 10px/1 system-ui,sans-serif}
`;
const SALE_STYLE = `
.on-sale{box-sizing:border-box;display:flex;align-items:center;justify-content:center;flex-shrink:0;height:22px;margin-right:auto;padding:0 6px;border-radius:5px;background:#000;border:1px solid #fff;box-shadow:0 1px 5px #0009;color:#fff;white-space:nowrap}
button.on-sale{font:inherit;pointer-events:auto;cursor:pointer}button.on-sale:focus-visible{outline:2px solid #e7cb84;outline-offset:2px}
`;
const SALE_STATUS_STYLE = `
.on-sale[data-state]{position:relative;border-color:transparent;color:white}
.on-sale[data-state]::after{content:"";position:absolute;inset:-1px;border:2px solid #57ed8c;border-radius:inherit;pointer-events:none}
.on-sale[data-state="undercut"]::after{border-color:#ff626b}
.on-sale[data-state="bid"]{background:#145834;gap:3px}
.on-sale[data-state="bid"] svg text{fill:#145834}
@media (prefers-reduced-motion:no-preference){
  .on-sale[data-pulse]::after{animation:kosmore-sale-pulse 2.4s ease-in-out infinite}
  .on-sale[data-state="undercut"][data-pulse]::after{animation-duration:1.92s}
}
@keyframes kosmore-sale-pulse{0%,100%{opacity:1}50%{opacity:.32}}
`;
const STYLE = `
${HOST_STYLE}
${SALE_STYLE}
${SALE_STATUS_STYLE}
.top-row,.bottom-row{position:absolute;left:0;right:0;display:flex;align-items:center;gap:4px;min-width:0}
.top-row{top:0;justify-content:flex-end;align-items:flex-start}.bottom-row{bottom:0;justify-content:flex-end}
.icons{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:4px;min-width:0;max-width:100%;margin-left:auto}
.signal-badge{box-sizing:border-box;display:flex;align-items:center;justify-content:center;flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#171027ed;border:1px solid #b6955a;box-shadow:0 1px 5px #0009;color:#f4d68c}
.signal-badge.with-price{flex-shrink:1;width:auto;min-width:22px;max-width:100%;border-radius:6px;padding:0 5px;gap:2px}
.badge-price{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${SIGNAL_BADGE_CSS}
.market-link{pointer-events:auto;cursor:pointer;text-decoration:none}.market-link:hover{filter:brightness(1.2)}.market-link:focus-visible{outline:2px solid #e7cb84;outline-offset:2px}
svg{display:block;flex-shrink:0}
@container (max-width:150px){.on-sale{font-size:9px;padding:0 4px}.bottom-row{gap:3px}.signal-badge.with-price{padding:0 4px;gap:1.5px;font-size:9px}}
`;
const ALBUM_SALE_STYLE = `
${HOST_STYLE}
${SALE_STYLE}
${SALE_STATUS_STYLE}
:host { inset: 0; }
.on-sale, .on-sale[data-state] {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: auto;
  margin: 0;
  padding: .35em .65em;
  border-radius: 7px;
  background: rgb(0 0 0 / .62);
  font-size: clamp(11px, 12cqi, 24px);
  font-weight: 700;
}
.on-sale > svg { width: 24px; height: 24px; flex-shrink: 0; }
`;

function positionOverlay(element: HTMLElement): OverlayPosition | undefined {
  if (getComputedStyle(element).position !== "static") return;
  const { style } = element;
  const previous = {
    element,
    value: style.getPropertyValue("position"),
    priority: style.getPropertyPriority("position"),
  };
  style.setProperty("position", "relative");
  return previous;
}

function restorePosition(previous?: OverlayPosition) {
  if (!previous) return;
  const { element, value, priority } = previous;
  const { style } = element;
  if (style.position !== "relative" || style.getPropertyPriority("position"))
    return;
  if (value) style.setProperty("position", value, priority);
  else style.removeProperty("position");
}
export class CardOverlays {
  private provider: CardSignalProvider;
  private settings?: Settings;
  private warningThresholds = { [FUSION_WARNING]: 0n, [PACK_WARNING]: 0n };
  private entries = new Map<HTMLElement, Entry>();
  private queue = new Set<Entry>();
  private intersection: IntersectionObserver;
  private running = 0;
  private auctionNavigation?: AbortController;
  private offscreenTimer?: ReturnType<typeof setTimeout>;
  private scheduled = false;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private notBefore = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private summaryStatus?: ReturnType<typeof packSummaryStatus>;
  constructor(private client: KosmoraClient) {
    this.provider = new CardSignalProvider(client);
    this.intersection = new IntersectionObserver((records) => {
      for (const record of records) {
        const entry = this.entries.get(record.target as HTMLElement);
        if (!entry) continue;
        entry.visible = record.isIntersecting;
        this.updatePulse(entry);
        if (this.shouldLoad(entry) && !entry.done) this.queue.add(entry);
        // A dispatched Services read continues in the worker. Let it settle
        // into this entry's cache if the user scrolls past it.
        else this.queue.delete(entry);
      }
      this.pump();
      this.updateSummaryStatus();
    });
  }
  start() {
    const style = el("style");
    style.textContent = `[${FUSION_WARNING}], [${PACK_WARNING}] {
      outline: 3px solid #ff454f !important;
      outline-offset: 2px;
      box-shadow: 0 0 8px 3px #ff334bb3, 0 0 18px 4px #f3233f66 !important;
    }`;
    document.head.append(style);
    observePage((changes) => {
      if (
        this.enabled() ||
        this.entries.size ||
        this.summaryStatus ||
        this.refreshTimer ||
        location.pathname === "/packs/open"
      )
        this.scan(changes);
    });
    window.addEventListener("resize", () => {
      if (this.enabled() || this.summaryStatus) this.schedule();
    });
    window.addEventListener("popstate", () => this.invalidate());
    const refresh = () => {
      if (!document.hidden && this.enabled()) this.invalidate(false);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => {
      for (const entry of this.entries.values()) if (entry.visible) this.updatePulse(entry);
      refresh();
    });
  }
  private syncRefreshTimer() {
    if (this.enabled()) {
      this.refreshTimer ??= setInterval(() => {
        if (!document.hidden && this.enabled()) this.invalidate(false);
      }, 300_000);
    } else {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }
  setSettings(settings: Settings) {
    const changed =
      this.settings?.cardOverlaysEnabled !== settings.cardOverlaysEnabled ||
      this.settings?.disableCardOverlaysInPulsar !==
        settings.disableCardOverlaysInPulsar ||
      this.settings?.disableCardOverlaysInVortex !==
        settings.disableCardOverlaysInVortex ||
      this.settings?.showOnSaleOverlay !== settings.showOnSaleOverlay ||
      this.settings?.showActiveAuctionsOverlay !==
        settings.showActiveAuctionsOverlay ||
      this.settings?.showSaleHistoryOverlay !==
        settings.showSaleHistoryOverlay ||
      this.settings?.showLastSalePriceOverlay !==
        settings.showLastSalePriceOverlay ||
      this.settings?.showLowestListingPriceOverlay !==
        settings.showLowestListingPriceOverlay ||
      this.settings?.showFriendInterestOverlay !==
        settings.showFriendInterestOverlay ||
      this.settings?.showQuestOverlay !== settings.showQuestOverlay;
    const bidsChanged =
      this.settings?.showAuctionBidCounts !== settings.showAuctionBidCounts;
    const highlightsChanged = this.settings?.highlightLowestListings !== settings.highlightLowestListings ||
      this.settings?.warnUndercutListings !== settings.warnUndercutListings;
    const priceModeChanged =
      this.settings?.useMedianOverlayPrice !== settings.useMedianOverlayPrice;
    const warning = priceWarningForPage(settings);
    const warningChanged = priceWarningForPage(this.settings) !== warning;
    const thresholds = {
      [FUSION_WARNING]: settingMicros(settings.fusionWarningThreshold)!,
      [PACK_WARNING]: settingMicros(settings.packWarningThreshold)!,
    };
    const thresholdChanged = warning && this.warningThresholds[warning] !== thresholds[warning];
    this.warningThresholds = thresholds;
    this.settings = settings;
    if (changed || warningChanged) {
      this.invalidate();
      return;
    }
    if (bidsChanged && settings.showActiveAuctionsOverlay && !settings.showLowestListingPriceOverlay) {
      this.invalidate(false);
      return;
    }
    if (priceModeChanged || bidsChanged || thresholdChanged || highlightsChanged)
      for (const entry of this.entries.values()) {
        if (entry.signals && (priceModeChanged || (highlightsChanged && entry.signals.onSale) || (bidsChanged && entry.signals.lowestListing?.bids)))
          this.render(entry, entry.signals, true);
        else if (thresholdChanged)
          this.renderWarning(entry, entry.signals);
      }
  }
  invalidate(clear = true) {
    this.generation++;
    this.notBefore = 0;
    clearTimeout(this.timer);
    clearTimeout(this.offscreenTimer);
    this.offscreenTimer = undefined;
    this.provider.reset();
    this.queue.clear();
    for (const entry of this.entries.values()) {
      if (clear) this.remove(entry);
      else {
        entry.done = false;
        entry.request = undefined;
        if (this.shouldLoad(entry)) this.queue.add(entry);
      }
    }
    if (clear) this.entries.clear();
    this.schedule();
  }
  refreshAccountPrices() {
    const ids = new Set<string>();
    for (const entry of this.entries.values())
      if (entry.signals?.activeAuctions) ids.add(entry.context.subjectId);
    if (ids.size) this.refreshCards(ids);
  }
  refreshCards(ids: ReadonlySet<string>) {
    this.provider.invalidateCards(ids);
    for (const entry of this.entries.values()) {
      if (!ids.has(entry.context.subjectId)) continue;
      entry.done = false;
      entry.request?.abort();
      if (this.shouldLoad(entry)) this.queue.add(entry);
    }
    this.pump();
  }
  refreshSaleStatus(ids: ReadonlySet<string>) {
    if (
      !this.enabled() ||
      !this.settings?.cardOverlaysEnabled ||
      !this.settings.showOnSaleOverlay
    )
      return;
    for (const entry of this.entries.values())
      if (ids.has(entry.context.subjectId)) this.renderSaleStatus(entry);
  }
  private renderSaleStatus(entry: Entry) {
    const onSale = this.client.saleStatus?.(entry.context.subjectId, finishOf(entry.context.variant)) ?? false;
    if (!entry.signals && !onSale) return;
    const cached = entry.signals?.lowestListing && this.client.peekAuction?.(entry.context.subjectId, finishOf(entry.context.variant));
    this.render(entry, {
      activeAuctions: false,
      saleHistory: false,
      interestedFriends: 0,
      quest: false,
      ...entry.signals,
      ...(cached && { lowestListing: cached.value.lowestListing }),
      onSale,
    });
  }
  signals(
    context: CardContext,
    settings: Settings,
    onProgress?: (signals: CardSignals) => void,
    signal?: AbortSignal,
  ) {
    return this.provider.get(
      context.subjectId,
      {
        ...settingsForPage(settings, location.pathname),
        showOnSaleOverlay: false,
        showSaleHistoryOverlay: false,
        showLastSalePriceOverlay: false,
        showActiveAuctionsOverlay: false,
        showLowestListingPriceOverlay: false,
      },
      context.variant.fullArt
        ? "fullart"
        : context.variant.veil
          ? "veil"
          : "plain",
      onProgress,
      "interactive",
      signal,
    );
  }
  private cardIndicatorsEnabled() {
    return (
      this.settings &&
        settingsForPage(this.settings, location.pathname).cardOverlaysEnabled &&
        (this.settings?.showSaleHistoryOverlay ||
          this.settings?.showOnSaleOverlay ||
          this.settings?.showActiveAuctionsOverlay ||
          this.settings?.showFriendInterestOverlay ||
          this.settings?.showQuestOverlay)
    );
  }
  enabled() {
    const warning = priceWarningForPage(this.settings);
    return this.cardIndicatorsEnabled() || (warning === PACK_WARNING ? !!this.summaryStatus : !!warning);
  }
  private warningForEntry(entry: Entry) {
    const warning = priceWarningForPage(this.settings);
    return warning === PACK_WARNING && !this.isSummaryEntry(entry) ? undefined : warning;
  }
  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.scan();
    });
  }
  private scan(changes?: PageChanges) {
    this.mountSummaryStatus();
    this.syncRefreshTimer();
    if (!this.enabled()) {
      for (const entry of this.entries.values()) this.remove(entry);
      this.entries.clear();
      this.queue.clear();
      this.updateSummaryStatus();
      return;
    }
    const summaryOnly = priceWarningForPage(this.settings) === PACK_WARNING && !this.cardIndicatorsEnabled();
    const targets = new Map<HTMLElement, CardContext>();
    for (const scope of !changes || changes.full ? [document] : changes.roots)
      for (const [root, context] of cardOverlayTargets(document, scope))
        if (!summaryOnly || (context.surface === "summary" && this.summaryStatus?.grid.contains(root)))
          targets.set(root, context);
    for (const [root, entry] of this.entries) {
      if (changes && !affected(root, changes)) continue;
      const next =
        root.isConnected && cardOverlaysAllowed(root)
          ? resolveCard(root)
          : null;
      if (
        !next ||
        (summaryOnly && !this.isSummaryEntry(entry)) ||
        contextKey(next) !== entry.key ||
        root.closest('[hidden],[inert],[aria-hidden="true"]')
      ) {
        this.remove(entry);
        this.entries.delete(root);
      } else if (entry.host && !entry.host.isConnected) {
        entry.root.append(entry.host);
        if (entry.signals) this.render(entry, entry.signals);
      } else if (
        entry.signals?.onSale &&
        this.albumArtwork(entry) !==
          (entry.albumSale?.host.parentElement ?? undefined)
      ) {
        this.render(entry, entry.signals);
      }
    }
    const discovered = new Set<string>();
    for (const [root, context] of targets) {
      if (this.entries.has(root)) continue;
      discovered.add(context.subjectId);
      const entry: Entry = {
        root,
        context,
        key: contextKey(context),
        visible: false,
        done: false,
      };
      this.entries.set(root, entry);
      if (this.settings?.cardOverlaysEnabled && this.settings.showOnSaleOverlay)
        this.renderSaleStatus(entry);
      this.intersection.observe(root);
      if (this.isSummaryEntry(entry)) this.queue.add(entry);
    }
    if (discovered.size) this.client.observeCardIds?.([...discovered]);
    this.pump();
    this.updateSummaryStatus();
  }
  private mountSummaryStatus() {
    const grid =
      location.pathname === "/packs/open"
        ? document.querySelector<HTMLElement>(".ko-summary > .ko-grid")
        : null;
    if (grid !== this.summaryStatus?.grid) {
      clearTimeout(this.offscreenTimer);
      this.offscreenTimer = undefined;
      this.summaryStatus?.host.remove();
      this.summaryStatus = grid ? packSummaryStatus(grid) : undefined;
    }
    if (
      this.summaryStatus &&
      grid?.previousElementSibling !== this.summaryStatus.host
    )
      grid?.before(this.summaryStatus.host);
  }
  private updateSummaryStatus() {
    const status = this.summaryStatus;
    if (!status?.host.isConnected) return;
    const loading = [...this.entries.values()].some(
      (entry) =>
        this.isSummaryEntry(entry) &&
        !entry.hasRenderedResult &&
        !entry.done &&
        (entry.request || this.notBefore !== Infinity),
    );
    status.setLoading(loading);
    if (
      loading &&
      Number.isFinite(this.notBefore) &&
      Date.now() < this.notBefore
    )
      status.rateLimited(this.notBefore);
  }
  private isSummaryEntry(entry: Entry) {
    return (
      entry.context.surface === "summary" &&
      !!this.summaryStatus?.grid.contains(entry.root)
    );
  }
  private shouldLoad(entry: Entry) {
    return entry.visible || this.isSummaryEntry(entry);
  }
  private remove(entry: Entry) {
    entry.root.removeAttribute(FUSION_WARNING);
    entry.root.removeAttribute(PACK_WARNING);
    entry.request?.abort();
    this.intersection.unobserve(entry.root);
    this.queue.delete(entry);
    entry.host?.remove();
    restorePosition(entry.positioned);
    this.removeAlbumSale(entry);
  }
  private removeAlbumSale(entry: Entry) {
    entry.albumSale?.host.remove();
    restorePosition(entry.albumSale?.positioned);
    entry.albumSale = undefined;
  }
  private albumArtwork(entry: Entry) {
    if (
      !entry.signals?.onSale ||
      !this.settings?.showOnSaleOverlay ||
      !/^\/albums\/[^/]+\/?$/.test(location.pathname)
    )
      return;
    return (
      entry.root.querySelector<HTMLElement>(".kc-window, .kc-fa-art") ??
      undefined
    );
  }
  private current(entry: Entry, generation: number) {
    const context = resolveCard(entry.root);
    return (
      generation === this.generation &&
      this.enabled() &&
      this.entries.get(entry.root) === entry &&
      entry.root.isConnected &&
      cardOverlaysAllowed(entry.root) &&
      !!context &&
      contextKey(context) === entry.key
    );
  }
  private pump(allowOffscreen = false) {
    if (
      this.running >= 2 ||
      !this.enabled() ||
      document.hidden ||
      !this.queue.size
    )
      return;
    if (Date.now() < this.notBefore) {
      if (Number.isFinite(this.notBefore)) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.pump(), this.notBefore - Date.now());
      }
      return;
    }
    let entry = [...this.queue].find((candidate) => candidate.visible);
    let offscreenGrid: HTMLElement | undefined;
    if (!entry) {
      if (this.running) return;
      if (!allowOffscreen || this.client.hasInteractiveReads?.()) {
        this.offscreenTimer ??= setTimeout(() => {
          this.offscreenTimer = undefined;
          this.pump(true);
        }, OFFSCREEN_PAUSE_MS);
        return;
      }
      entry = this.queue.values().next().value!;
      offscreenGrid = this.summaryStatus?.grid;
    }
    this.queue.delete(entry);
    if (
      !this.shouldLoad(entry) ||
      entry.request ||
      !this.current(entry, this.generation)
    ) {
      this.pump();
      return;
    }
    const generation = this.generation,
      settings = this.settings!;
    const reads = this.warningForEntry(entry)
      ? {
          ...settings,
          cardOverlaysEnabled: true,
          showSaleHistoryOverlay: true,
          showLastSalePriceOverlay: true,
          showOnSaleOverlay:
            settings.cardOverlaysEnabled && settings.showOnSaleOverlay,
          showActiveAuctionsOverlay:
            settings.cardOverlaysEnabled && settings.showActiveAuctionsOverlay,
          showFriendInterestOverlay:
            settings.cardOverlaysEnabled && settings.showFriendInterestOverlay,
          showQuestOverlay:
            settings.cardOverlaysEnabled && settings.showQuestOverlay,
        }
      : settings;
    this.running++;
    const request = new AbortController();
    entry.request = request;
    const valid = () =>
      !request.signal.aborted && this.current(entry, generation);
    let slotReleased = false;
    const releaseSlot = () => {
      if (slotReleased) return false;
      slotReleased = true;
      this.running--;
      return true;
    };
    const sameOffscreenRecap = () =>
      !!offscreenGrid &&
      offscreenGrid === this.summaryStatus?.grid &&
      offscreenGrid.isConnected &&
      offscreenGrid.contains(entry.root) &&
      generation === this.generation &&
      !request.signal.aborted;
    const stagedRecap =
      this.isSummaryEntry(entry) &&
      ((settings.showSaleHistoryOverlay && settings.showLastSalePriceOverlay) ||
        (settings.showActiveAuctionsOverlay &&
          settings.showLowestListingPriceOverlay));
    const finish = entry.context.variant.fullArt
      ? "fullart"
      : entry.context.variant.veil
        ? "veil"
        : "plain";
    // Keep a settled overlay intact while refreshing. Only a first load needs
    // progressive badges, coalesced into one update per paint.
    const progressive = !entry.host;
    let frame = 0;
    let latest: CardSignals;
    void this.provider
      .get(
        entry.context.subjectId,
        entry.visible
          ? reads
          : {
              ...reads,
              showOnSaleOverlay: false,
              showFriendInterestOverlay: false,
            },
        finish,
        (signals) => {
          if (!progressive) return;
          latest = signals;
          frame ||= requestAnimationFrame(() => {
            frame = 0;
            if (valid()) this.render(entry, latest);
          });
        },
        entry.visible ? "foreground" : "background",
        request.signal,
        stagedRecap
          ? () => {
              if (valid() && releaseSlot()) this.pump(sameOffscreenRecap());
            }
          : undefined,
      )
      .then(
        (signals) => {
          if (frame) cancelAnimationFrame(frame);
          if (valid()) {
            entry.done = true;
            this.render(entry, signals);
            entry.hasRenderedResult = true;
          }
        },
        (error) => {
          if (!valid()) return;
          entry.done = true;
          if (error instanceof ApiError && error.status === 429) {
            const retryAt = error.retryAt || Date.now() + 30_000;
            this.notBefore = Math.max(this.notBefore, retryAt);
            if (this.isSummaryEntry(entry)) {
              entry.done = false;
              this.summaryStatus?.rateLimited(
                retryAt,
                error.rateLimitRequestStartedAt,
              );
            }
          }
          if (error instanceof ApiError && error.status === 401)
            this.notBefore = Infinity;
        },
      )
      .finally(() => {
        const released = releaseSlot();
        if (entry.request === request) {
          entry.request = undefined;
          if (
            !entry.done &&
            this.shouldLoad(entry) &&
            this.current(entry, generation)
          )
            this.queue.add(entry);
        }
        // Continue this recap's offscreen queue without another idle pause.
        this.pump(released && entry.done && sameOffscreenRecap());
        this.updateSummaryStatus();
      });
    this.pump();
  }
  private renderWarning(entry: Entry, signals?: CardSignals) {
    const price = signals && overlaySalePrice(signals, this.settings!.useMedianOverlayPrice);
    const warning = this.warningForEntry(entry);
    if (warning)
      entry.root.toggleAttribute(warning, !!price && BigInt(price) > this.warningThresholds[warning]);
  }
  private updatePulse(entry: Entry) {
    const label = entry.saleLabel;
    if (!label) return;
    const state = label.dataset.state;
    label.toggleAttribute("data-pulse", entry.visible && !document.hidden && (state === "lowest" || state === "undercut"));
  }
  private async openOwnAuction(entry: Entry) {
    const account = this.client.displayAccount?.key;
    if (!account || !this.client.ownAuctionFor) return;
    this.auctionNavigation?.abort();
    const controller = new AbortController();
    this.auctionNavigation = controller;
    const url = location.href;
    const current = () => !controller.signal.aborted && url === location.href &&
      entry.root.isConnected && this.entries.get(entry.root) === entry &&
      entry.saleLabel?.isConnected && this.client.displayAccount?.key === account;
    try {
      const auction = await this.client.ownAuctionFor(entry.context.subjectId, finishOf(entry.context.variant), account,
        controller.signal, entry.signals?.ownListing);
      if (current()) location.assign("/market/" + auction);
    } catch (error) {
      if (current() && entry.saleLabel) {
        const message = error instanceof Error ? error.message : "Could not open this listing.";
        entry.saleLabel.textContent = "Retry listing";
        entry.saleLabel.title = message;
        entry.saleLabel.setAttribute("aria-label", message + " Retry listing.");
      }
    } finally {
      if (this.auctionNavigation === controller) this.auctionNavigation = undefined;
    }
  }
  private render(entry: Entry, signals: CardSignals, force = false) {
    this.renderWarning(entry, signals);
    if (this.settings?.cardOverlaysEnabled && this.settings.showOnSaleOverlay) {
      const finish = finishOf(entry.context.variant);
      const onSale = this.client.saleStatus
        ? this.client.saleStatus(entry.context.subjectId, finish) === true : signals.onSale;
      const highlight = onSale
        ? this.client.saleHighlight?.(entry.context.subjectId, finish) : undefined;
      if (signals.onSale !== onSale || signals.saleHighlight !== highlight?.state || signals.ownListing !== highlight?.listing)
        signals = { ...signals, onSale, saleHighlight: highlight?.state, ownListing: highlight?.listing };
    }
    const sameSignals =
      entry.signals && sameOverlaySignals(entry.signals, signals);
    entry.signals = signals;
    const artwork = this.albumArtwork(entry);
    const artworkChanged =
      artwork !== (entry.albumSale?.host.parentElement ?? undefined);
    if (!force && sameSignals && entry.host?.isConnected && !artworkChanged) return;
    if (artworkChanged) this.removeAlbumSale(entry);
    entry.saleLabel = undefined;
    if (
      !this.settings!.cardOverlaysEnabled ||
      (!signals.onSale &&
        !signals.activeAuctions &&
        !(signals.saleHistory && this.settings!.showSaleHistoryOverlay) &&
        !signals.interestedFriends &&
        !signals.quest)
    ) {
      entry.host?.remove();
      entry.host = undefined;
      return;
    }
    const host = entry.host ?? el("span");
    host.setAttribute(OVERLAY_ATTR, "");
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" }),
      style = el("style");
    style.textContent = STYLE;
    shadow.replaceChildren(style);
    const top = el("div", "top-row"),
      bottom = el("div", "bottom-row");
    if (this.settings!.showOnSaleOverlay && signals.onSale) {
      const label = el("button", "on-sale", "For Sale");
      label.type = "button";
      isolateMarketControl(label);
      label.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void this.openOwnAuction(entry);
      });
      const state = signals.saleHighlight;
      const enabled = state === "undercut" ? this.settings!.warnUndercutListings : this.settings!.highlightLowestListings;
      let description = "You have this finish for sale on the market";
      if (state && enabled) {
        label.dataset.state = state;
        if (state !== "bid") description +=
          state === "lowest" ? ". Your listing is lowest or tied for lowest." : ". Another listing is cheaper.";
      }
      const bids = signals.ownListing?.bids;
      if (bids) {
        if (this.settings!.showAuctionBidCounts) label.prepend(auctionIcon(bids));
        description += `. Your listing has ${bids.toLocaleString()} ${bids === 1 ? "bid" : "bids"}.`;
      }
      description += (description.endsWith(".") ? " " : ". ") + "Open your auction listing.";
      label.title = description;
      label.setAttribute("aria-label", description);
      entry.saleLabel = label;
      this.updatePulse(entry);
      if (artwork) {
        const sale = entry.albumSale ?? {
          host: el("span"),
          positioned: positionOverlay(artwork),
        };
        sale.host.setAttribute(OVERLAY_ATTR, "");
        const saleShadow =
          sale.host.shadowRoot ?? sale.host.attachShadow({ mode: "open" });
        saleShadow.replaceChildren(el("style", "", ALBUM_SALE_STYLE), label);
        entry.albumSale = sale;
        if (!sale.host.isConnected) artwork.append(sale.host);
      } else {
        top.append(label);
      }
    }
    const badges = signalBadges(
      signals,
      this.settings!,
      true,
      signals.marketName ?? entry.context.name,
    );
    if (badges.length) {
      const icons = el("div", "icons");
      for (const kind of ["sale", "auction"])
        icons.append(
          ...badges.filter((badge) => badge.classList.contains(kind)),
        );
      if (icons.children.length) top.append(icons);
      for (const kind of ["quest", "friend"])
        bottom.append(
          ...badges.filter((badge) => badge.classList.contains(kind)),
        );
    }
    if (top.children.length) shadow.append(top);
    if (bottom.children.length) shadow.append(bottom);
    entry.positioned ??= positionOverlay(entry.root);
    entry.host = host;
    if (!host.isConnected) entry.root.append(host);
  }
}
