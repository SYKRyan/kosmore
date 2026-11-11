import { LISTING_REFRESH_LABEL } from "../kosmora/my-listings";
import type { KosmoraClient, Settings } from "../shared/types";
import { messageOf } from "../shared/types";
import {
  SALE_MINIMUMS,
  adjustedSalePrice,
  belowSaleMinimum,
  discountedSalePrice,
  quickSalePrice,
} from "../shared/sales-prices";
import {
  isSaleBatchMessage,
  saleSelectionKey,
} from "../shared/sale-family-selection";
import {
  editableSalesInput,
  fillSalesInput,
  salesTargets,
  salesTarget,
  salesSubmitButton,
  SALES_SUMMARY_WARNING,
  type SalesTarget,
} from "../kosmora/sales";
import { formatKosmo } from "../kosmora/contracts";
import { ApiError } from "../kosmora/client";
import {
  CardSignalProvider,
  type CardSignals,
  type OverlaySettings,
} from "./card-signals";
import { cardIcon, headerIcon } from "./icons";
import { MARKET_BADGE_CSS } from "./signal-badges";
import { el } from "./ui";
import { observePage, affected, type PageChanges } from "./page-changes";

const STYLE = `:host{display:block;margin:6px 0 10px;font:12px/1.4 system-ui,sans-serif;color:#ece7f3}:host([hidden]){display:none}.badges{display:flex;flex-wrap:wrap;gap:6px}.price-badge{display:inline-flex;align-items:center;gap:5px;max-width:100%;min-height:28px;box-sizing:border-box;padding:4px 8px;border:1px solid;border-radius:6px;font:inherit;box-shadow:0 1px 5px #0005}button{cursor:pointer}button:hover{filter:brightness(1.2)}button:focus-visible{outline:2px solid #e7cb84;outline-offset:3px}button:disabled{cursor:default;opacity:.65}svg{display:block;flex-shrink:0}.history-controls{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;max-width:100%}.history-check{padding:4px;color:#ead6ab;background:#211831;border-color:#584869}.history-check svg{width:14px;height:14px}.amount{overflow-wrap:anywhere}[data-kosmore-sales-warning="row"]{display:block;font-weight:600;margin-bottom:6px}.quick-prices{margin-top:6px}.badges:empty+.quick-prices{margin-top:0}.quick-prices-label{display:block;margin-bottom:4px;color:#d4c6e4}.discount,.quick-price{color:#ffe3af;background:#2c2039;border-color:#796143}.status{font-size:11px;color:#b9dcbc;margin-top:4px}.status:empty{display:none}.status.loading{color:#c3b2d4}.status.error{color:#f3a6b1}${MARKET_BADGE_CSS}`;
interface OverlaySize {
  width: number;
  height: number;
}

interface Entry {
  target: SalesTarget;
  host: HTMLElement;
  batchRow?: HTMLElement;
  settledSize?: OverlaySize;
  reservedSize?: OverlaySize;
  body: HTMLElement;
  status: HTMLElement;
  visible: boolean;
  loading: boolean;
  marketRequest?: AbortController;
  editable: boolean;
  quickHeading?: HTMLElement;
  quickSection?: HTMLElement;
  quickPrices: HTMLButtonElement[];
  warning?: HTMLElement;
  signals?: CardSignals;
  error?: string;
  myPrice?: string;
  myAccount?: string;
  recordedAt?: number;
  mineDirty?: boolean;
  mineRequest?: AbortController;
  mineLoading?: boolean;
  mineResolved?: boolean;
  mineError?: string;
  copyId?: string;
  discountPrice?: string;
}
const KEYS = [
  "salesOverlaysEnabled",
  "showSalesLastSale",
  "salesLastSaleSetsPrice",
  "salesLastSaleAdjustment",
  "showSalesLowestListing",
  "salesLowestListingSetsPrice",
  "salesLowestListingAdjustment",
  "showSalesMyLastListing",
  "salesMyLastListingSetsPrice",
  "salesMyLastListingAdjustment",
  "salesDiscountEnabled",
  "salesDiscountAmount",
  "salesDiscountMode",
  "salesDiscountThreshold",
  "salesQuickPricesEnabled",
  "salesCustomMinimumsEnabled",
] as const;

export class SalesOverlays {
  private provider: CardSignalProvider;
  private settings?: Settings;
  private entries = new Map<HTMLInputElement, Entry>();
  private queue = new Set<Entry>();
  private intersection: IntersectionObserver;
  private batchHosts = new WeakMap<Element, Entry>();
  private batchSizes = new ResizeObserver((records) => {
    for (const { target, contentRect } of records) {
      const entry = this.batchHosts.get(target);
      if (!entry || !contentRect.width) continue;
      const { width } = contentRect;
      let { height } = contentRect;
      if (
        entry.reservedSize &&
        Math.abs(entry.reservedSize.width - width) > 0.5
      ) {
        entry.reservedSize = entry.settledSize = undefined;
        entry.host.style.removeProperty("min-block-size");
        this.updateVisibility(entry);
        // The natural height can equal the old minimum, so another resize is not guaranteed.
        height = entry.host.getBoundingClientRect().height;
      }
      if (
        height &&
        !entry.loading &&
        !entry.mineLoading &&
        entry.body.childElementCount
      )
        entry.settledSize = { width, height };
    }
  });
  private generation = 0;
  private running = 0;
  private scheduled = false;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private saleSpacing?: HTMLStyleElement;
  private notBefore = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private summaryWarning?: HTMLElement;
  private listingContextLost = false;
  private historyNotice?: HTMLElement;
  private warningFrame = 0;
  private batchCopies?: {
    page: string;
    batch?: { revision: number; copies: Map<string, string> };
    draft?: { revision: number; copies: Map<string, string> };
  };
  private historyRefresh?: {
    page: string;
    account: string;
    request: AbortController;
    promise: Promise<unknown>;
  };
  constructor(private client: KosmoraClient) {
    this.provider = new CardSignalProvider(client);
    this.intersection = new IntersectionObserver((records) => {
      for (const record of records) {
        const entry = this.entries.get(record.target as HTMLInputElement);
        if (!entry) continue;
        entry.visible = record.isIntersecting;
        if (entry.visible && entry.loading) this.queue.add(entry);
        else this.queue.delete(entry);
        if (entry.visible) void this.loadMyPrice(entry);
        else {
          entry.marketRequest?.abort();
          entry.mineRequest?.abort();
          entry.mineRequest = undefined;
          entry.mineLoading = false;
        }
      }
      this.pump();
    });
  }
  start() {
    window.addEventListener("pagehide", () => {
      this.generation++;
      this.provider.reset();
      this.historyRefresh?.request.abort();
      for (const entry of this.entries.values()) entry.mineRequest?.abort();
    });
    window.addEventListener("message", (event) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        location.pathname !== "/market/sell/batch" ||
        !isSaleBatchMessage(event.data) ||
        event.data.page !== location.href
      )
        return;
      const { page, source, revision, copies } = event.data;
      if (this.batchCopies?.page !== page) this.batchCopies = { page };
      if (revision <= (this.batchCopies[source]?.revision ?? 0)) return;
      this.batchCopies[source] = { revision, copies: new Map(copies) };
      if (this.settings?.salesDiscountEnabled && this.enabled())
        this.schedule();
    });
    const updateWarnings = () => {
      if (
        this.warningFrame ||
        !this.settings?.salesCustomMinimumsEnabled ||
        !this.enabled()
      )
        return;
      this.warningFrame = requestAnimationFrame(() => {
        this.warningFrame = 0;
        this.refreshWarnings();
      });
    };
    for (const event of ["input", "change", "click"])
      document.addEventListener(event, updateWarnings, true);
    observePage((changes) => {
      if (this.enabled() || this.entries.size || this.refreshTimer)
        this.scan(changes);
    });
    window.addEventListener("popstate", () => this.invalidate());
    window.addEventListener("focus", () => {
      if (this.enabled()) this.invalidate(false);
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.enabled()) this.invalidate(false);
      else
        for (const entry of this.entries.values()) {
          entry.marketRequest?.abort();
          entry.mineRequest?.abort();
          entry.mineRequest = undefined;
          entry.mineLoading = false;
        }
    });
  }
  setSettings(settings: Settings) {
    const quickChanged =
      this.settings?.salesQuickPricesEnabled !==
        settings.salesQuickPricesEnabled ||
      JSON.stringify(this.settings?.salesQuickPrices) !==
        JSON.stringify(settings.salesQuickPrices);
    const changed =
      !this.settings ||
      quickChanged ||
      KEYS.some((key) => this.settings![key] !== settings[key]) ||
      JSON.stringify(this.settings.salesCustomMinimums) !==
        JSON.stringify(settings.salesCustomMinimums);
    this.settings = settings;
    if (!changed) return;
    if (quickChanged)
      for (const entry of this.entries.values()) this.mountQuickPrices(entry);
    this.invalidate(false);
  }
  enabled() {
    return (
      /^\/market\/sell(?:\/batch)?$/.test(location.pathname) &&
      this.settings?.salesOverlaysEnabled &&
      (this.settings.showSalesLastSale ||
        this.settings.showSalesLowestListing ||
        this.settings.showSalesMyLastListing ||
        this.settings.salesDiscountEnabled ||
        this.settings.salesCustomMinimumsEnabled ||
        (this.settings.salesQuickPricesEnabled &&
          this.settings.salesQuickPrices.length > 0))
    );
  }
  invalidate(clear = true) {
    this.generation++;
    this.provider.reset();
    this.notBefore = 0;
    clearTimeout(this.timer);
    for (const entry of this.entries.values()) {
      if (clear) this.remove(entry);
      else {
        this.reserveBatchSpace(entry);
        entry.mineRequest?.abort();
        entry.mineRequest = undefined;
        entry.mineLoading = false;
        entry.mineResolved = false;
        entry.mineError = undefined;
        entry.loading = this.showsMarketPrices();
        entry.marketRequest = undefined;
        entry.error = undefined;
        entry.myPrice = undefined;
        entry.myAccount = undefined;
        entry.discountPrice = undefined;
        if (entry.visible && entry.loading) this.queue.add(entry);
        this.render(entry);
      }
    }
    this.schedule();
  }
  private reserveBatchSpace(entry: Entry) {
    const size = entry.settledSize;
    if (!size?.height) return;
    entry.reservedSize = size;
    entry.host.style.minBlockSize = `${size.height}px`;
  }
  private remove(entry: Entry) {
    if (entry.batchRow) {
      this.batchSizes.unobserve(entry.host);
      this.batchHosts.delete(entry.host);
    }
    entry.marketRequest?.abort();
    entry.mineRequest?.abort();
    this.intersection.unobserve(entry.target.input);
    this.queue.delete(entry);
    entry.host.remove();
    entry.warning?.remove();
    this.entries.delete(entry.target.input);
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
    if (
      this.historyRefresh &&
      (!this.enabled() ||
        !this.settings?.salesDiscountEnabled ||
        this.historyRefresh.page !== location.href)
    ) {
      this.historyRefresh.request.abort();
      this.historyRefresh = undefined;
    }
    if (this.batchCopies?.page !== location.href) this.batchCopies = undefined;
    if (this.enabled()) {
      this.refreshTimer ??= setInterval(() => {
        if (!document.hidden && this.enabled()) this.invalidate(false);
      }, 300_000);
    } else {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    const targets = new Map<HTMLInputElement, SalesTarget>();
    const replaced = new Map<Element, Entry>();
    const removedByKey = new Map<string, Entry | null>();
    if (this.enabled())
      for (const scope of !changes || changes.full ? [document] : changes.roots)
        for (const [input, target] of salesTargets(document, scope))
          targets.set(input, target);
    for (const [input, entry] of this.entries) {
      if (
        changes &&
        this.enabled() &&
        !affected(input.closest(".bsell-row,.deal") ?? input, changes)
      )
        continue;
      const target = this.enabled() ? salesTarget(input) : undefined;
      if (!target || target.key !== entry.target.key) {
        if (entry.batchRow?.isConnected) replaced.set(entry.batchRow, entry);
        else if (entry.batchRow)
          removedByKey.set(
            entry.target.key,
            removedByKey.has(entry.target.key) ? null : entry,
          );
        this.remove(entry);
        continue;
      }
      entry.target = target;
      const copyId = this.selectedCopy(target);
      if (entry.copyId !== copyId) {
        entry.copyId = copyId;
        entry.discountPrice = undefined;
        entry.mineRequest?.abort();
        entry.mineRequest = undefined;
        entry.mineLoading = false;
        entry.mineResolved = false;
        this.render(entry);
      }
      if (target.after.nextElementSibling !== entry.host)
        target.after.after(entry.host);
      if (entry.editable !== editableSalesInput(input)) this.render(entry);
      if (entry.visible) void this.loadMyPrice(entry);
    }
    const newKeyCounts = new Map<string, number>();
    if (removedByKey.size)
      for (const [input, { key }] of targets)
        if (!this.entries.has(input))
          newKeyCounts.set(key, (newKeyCounts.get(key) ?? 0) + 1);
    for (const [input, target] of targets) {
      if (this.entries.has(input)) continue;
      const host = el("div");
      host.setAttribute("data-kosmore-sales-overlay", "");
      host.setAttribute("data-subject", target.context.subjectId);
      const shadow = host.attachShadow({ mode: "open" }),
        style = el("style"),
        body = el("div", "badges"),
        status = el("div", "status");
      style.textContent = STYLE;
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      shadow.append(style, body, status);
      const batchRow =
        target.after.closest<HTMLElement>(".bsell-row") ?? undefined;
      // A native repaint can replace the row or its price input. Carry geometry
      // only when the old and new row can be matched unambiguously.
      if (!this.saleSpacing) {
        this.saleSpacing = el("style");
        this.saleSpacing.textContent = `
          .bsell-row [data-kosmore-sales-overlay]:not([hidden]):has(+ [data-kosmore-fusion-family]:not([hidden])){margin-bottom:2px}
          .bsell-row [data-kosmore-sales-overlay]:not([hidden]) + [data-kosmore-fusion-family]{margin-top:2px}
          [data-kosmore-sales-warning]{display:block;font:600 12px/1.4 system-ui,sans-serif;margin:2px 0 0;grid-column:1/-1}
          ${SALES_SUMMARY_WARNING}{margin:0;text-align:center;flex:0 0 100%}
          .bsell ${SALES_SUMMARY_WARNING},.bsell-bar > ${SALES_SUMMARY_WARNING}{text-align:end}
          .bsell-bar:has(> ${SALES_SUMMARY_WARNING}){row-gap:4px}
          .sell-form [data-kosmore-fusion-family]:has(+ ${SALES_SUMMARY_WARNING}){margin-bottom:2px}
        `;
        document.head.append(this.saleSpacing);
      }
      const previous =
        batchRow &&
        (replaced.get(batchRow) ??
          (newKeyCounts.get(target.key) === 1
            ? removedByKey.get(target.key)
            : undefined));
      const entry: Entry = {
        target,
        batchRow,
        settledSize:
          previous?.target.key === target.key
            ? previous.settledSize
            : undefined,
        host,
        body,
        status,
        copyId: this.selectedCopy(target),
        quickPrices: [],
        visible: false,
        loading: this.showsMarketPrices(),
        editable: editableSalesInput(input),
      };
      this.entries.set(input, entry);
      this.mountQuickPrices(entry);
      this.reserveBatchSpace(entry);
      target.after.after(host);
      if (batchRow) {
        this.batchHosts.set(host, entry);
        this.batchSizes.observe(host);
      }
      this.render(entry);
      this.intersection.observe(input);
    }
    this.refreshWarnings();
    this.updateHistoryNotice();
    this.pump();
  }
  private showsMarketPrices() {
    return !!(
      this.settings?.showSalesLastSale || this.settings?.showSalesLowestListing
    );
  }
  private selectedCopy(target: SalesTarget) {
    if (!this.settings?.salesDiscountEnabled) return;
    if (target.copyId) return target.copyId;
    if (this.batchCopies?.page !== location.href) return;
    const { batch, draft } = this.batchCopies;
    const key = saleSelectionKey(target.context);
    return draft?.copies.get(key) ?? batch?.copies.get(key);
  }
  private valid(entry: Entry, generation = this.generation) {
    return (
      generation === this.generation &&
      this.entries.get(entry.target.input) === entry &&
      salesTarget(entry.target.input)?.key === entry.target.key &&
      !!this.enabled()
    );
  }
  private priceSettings(): OverlaySettings {
    const s = this.settings!;
    return {
      cardOverlaysEnabled: true,
      showOnSaleOverlay: false,
      showFriendInterestOverlay: false,
      showQuestOverlay: false,
      showSaleHistoryOverlay: s.showSalesLastSale,
      showLastSalePriceOverlay: true,
      showActiveAuctionsOverlay: s.showSalesLowestListing,
      showLowestListingPriceOverlay: true,
    };
  }
  private pump() {
    if (
      this.running >= 2 ||
      !this.enabled() ||
      document.hidden ||
      !this.queue.size
    )
      return;
    if (Date.now() < this.notBefore) {
      if (Number.isFinite(this.notBefore))
        this.timer = setTimeout(() => this.pump(), this.notBefore - Date.now());
      return;
    }
    const entry = this.queue.values().next().value!;
    this.queue.delete(entry);
    if (!entry.visible || entry.marketRequest || !this.valid(entry)) {
      this.pump();
      return;
    }
    const generation = this.generation,
      context = entry.target.context;
    this.running++;
    const request = new AbortController();
    entry.marketRequest = request;
    const valid = () =>
      !request.signal.aborted && this.valid(entry, generation);
    const marketJob =
      this.settings!.showSalesLastSale || this.settings!.showSalesLowestListing
        ? this.provider
            .get(
              context.subjectId,
              this.priceSettings(),
              context.variant.fullArt
                ? "fullart"
                : context.variant.veil
                  ? "veil"
                  : "plain",
              (signals) => {
                if (valid()) {
                  entry.signals = signals;
                  this.render(entry);
                }
              },
              "foreground",
              request.signal,
            )
            .then(
              (signals) => {
                if (valid()) entry.signals = signals;
              },
              (error) => {
                if (!valid()) return;
                entry.error = messageOf(error);
                if (error instanceof ApiError && error.status === 429)
                  this.notBefore = error.retryAt || Date.now() + 30_000;
                if (error instanceof ApiError && error.status === 401)
                  this.notBefore = Infinity;
              },
            )
        : Promise.resolve();
    void marketJob.finally(() => {
      if (entry.marketRequest === request) {
        entry.marketRequest = undefined;
        if (valid()) {
          entry.loading = false;
          this.render(entry);
        } else if (entry.visible && this.valid(entry, generation)) {
          this.queue.add(entry);
        }
      }
      this.running--;
      this.pump();
    });
    this.pump();
  }
  invalidateListings() {
    for (const entry of this.entries.values()) {
      entry.mineResolved = false;
      if (entry.mineRequest) entry.mineDirty = true;
      else if (entry.visible) void this.loadMyPrice(entry);
    }
  }
  private refreshDiscountHistory(subject: string, account: string) {
    const active = this.historyRefresh;
    if (active?.page === location.href && active.account === account)
      return active.promise;
    active?.request.abort();
    const request = new AbortController();
    const refresh = {
      page: location.href,
      account,
      request,
      promise: this.client
        .listingHistory(subject, "refresh", request.signal)
        .finally(() => {
          if (this.historyRefresh === refresh) this.historyRefresh = undefined;
        }),
    };
    this.historyRefresh = refresh;
    return refresh.promise;
  }
  private async loadMyPrice(entry: Entry, refresh = false) {
    if (
      !(
        this.settings?.showSalesMyLastListing ||
        this.settings?.salesDiscountEnabled
      ) ||
      this.listingContextLost ||
      document.hidden ||
      !entry.visible ||
      entry.mineRequest ||
      (entry.mineResolved && !refresh) ||
      !this.valid(entry)
    )
      return;
    if (!chrome.runtime?.id) {
      this.loseListingContext();
      return;
    }
    if (refresh && Date.now() < this.notBefore) {
      entry.mineError =
        "Your listing history is temporarily unavailable. Try again shortly.";
      this.render(entry);
      return;
    }
    this.reserveBatchSpace(entry);
    const request = new AbortController(),
      generation = this.generation;
    entry.mineRequest = request;
    entry.mineLoading = refresh;
    entry.mineError = undefined;
    entry.discountPrice = undefined;
    const valid = () =>
      !request.signal.aborted &&
      entry.mineRequest === request &&
      this.valid(entry, generation);
    this.render(entry);
    try {
      const account = await this.client.account(request.signal, false);
      if (!valid()) return;
      const subject = entry.target.context.subjectId;
      if (refresh) {
        if (this.settings!.salesDiscountEnabled && entry.copyId)
          await this.refreshDiscountHistory(subject, account.key);
        else
          await this.client.listingHistory(subject, "refresh", request.signal);
      }
      if (!valid()) return;
      entry.mineDirty = false;
      const history =
        this.settings!.salesDiscountEnabled && entry.copyId
          ? await this.client.cachedListings(subject, request.signal)
          : undefined;
      const result = history
        ? history.listings[0]
        : await this.client.latestListing(subject, request.signal);
      if (!valid()) return;
      entry.myAccount = account.key;
      entry.myPrice = result?.startPrice;
      entry.recordedAt = result?.submittedAt;
      if (history && entry.copyId) {
        this.render(entry);
        const price = await this.client.discountListingPrice(
          subject,
          entry.copyId,
          this.settings!.salesDiscountThreshold,
          history.listings,
          request.signal,
        );
        if (valid()) entry.discountPrice = price;
      } else entry.discountPrice = undefined;
    } catch (error) {
      if (!valid()) return;
      const message = messageOf(error);
      if (/^extension context invalidated\.?$/i.test(message)) {
        this.loseListingContext();
        return;
      }
      entry.mineError = `Your listing history: ${message}`;
      if (error instanceof ApiError && error.status === 429)
        this.notBefore = error.retryAt || Date.now() + 30_000;
    } finally {
      if (valid()) {
        entry.mineRequest = undefined;
        entry.mineLoading = false;
        entry.mineResolved = !entry.mineDirty;
        entry.mineDirty = false;
        this.render(entry);
        if (!entry.mineResolved) void this.loadMyPrice(entry);
      }
    }
  }
  private loseListingContext() {
    if (this.listingContextLost) return;
    this.listingContextLost = true;
    this.historyRefresh?.request.abort();
    for (const entry of this.entries.values()) {
      entry.mineRequest?.abort();
      entry.mineRequest = undefined;
      entry.mineLoading = false;
      entry.mineError = undefined;
      entry.myPrice = undefined;
      entry.myAccount = undefined;
      entry.recordedAt = undefined;
      entry.discountPrice = undefined;
      this.render(entry);
    }
    this.updateHistoryNotice();
  }
  private updateHistoryNotice() {
    const entry = this.listingContextLost
      ? this.entries.values().next().value
      : undefined;
    const anchor =
      entry?.batchRow?.closest(".bsell-list") ?? entry?.target.after;
    if (!anchor?.isConnected) {
      this.historyNotice?.remove();
      return;
    }
    const notice = (this.historyNotice ??= this.warning(
      "Refresh this Kosmora tab to reconnect your listing history.",
      "reconnect",
    ));
    if (anchor.previousElementSibling !== notice) anchor.before(notice);
  }
  private render(entry: Entry) {
    entry.editable = editableSalesInput(entry.target.input);
    for (const button of entry.quickPrices) button.disabled = !entry.editable;
    entry.body.replaceChildren();
    const loading = entry.loading || entry.mineLoading === true;
    entry.host.setAttribute("aria-busy", String(loading));
    if (loading) {
      entry.status.className = "status loading";
      entry.status.textContent = entry.reservedSize
        ? ""
        : "Loading market prices…";
    } else if (entry.error || entry.mineError) {
      entry.status.className = "status error";
      entry.status.textContent = entry.error ?? entry.mineError!;
    } else if (entry.status.matches(".loading,.error")) {
      entry.status.className = "status";
      entry.status.textContent = "";
    }
    const s = this.settings!;
    let historyBadge: HTMLElement | undefined;
    for (const [kind, label, visible, clickable, adjustment, price] of [
      [
        "sale",
        "Last Sale:",
        s.showSalesLastSale,
        s.salesLastSaleSetsPrice,
        s.salesLastSaleAdjustment,
        entry.signals?.lastSale?.price,
      ],
      [
        "auction",
        "Lowest Listed:",
        s.showSalesLowestListing,
        s.salesLowestListingSetsPrice,
        s.salesLowestListingAdjustment,
        entry.signals?.lowestListingPrice,
      ],
      [
        "history",
        "My Last Listing:",
        s.showSalesMyLastListing,
        s.salesMyLastListingSetsPrice,
        s.salesMyLastListingAdjustment,
        entry.myPrice,
      ],
    ] as const) {
      const hasData =
        kind === "sale"
          ? entry.signals?.saleHistory
          : kind === "history"
            ? true
            : entry.signals?.activeAuctions;
      if (!visible || !hasData) continue;
      const stale =
        kind === "sale"
          ? entry.signals?.staleLastSale
          : kind === "auction"
            ? entry.signals?.staleListingPrice
            : false;
      const canClick = clickable && price !== undefined && !stale;
      const badge = canClick
        ? el("button", `price-badge ${kind}`)
        : el("span", `price-badge ${kind}`);
      const text = price === undefined ? "—" : `$${formatKosmo(price)}`;
      badge.append(cardIcon(kind), el("span", "amount", `${label} ${text}`));
      badge.toggleAttribute("data-stale-price", !!stale);
      badge.title =
        (kind === "history" ? entry.mineError : entry.error) ??
        `${label.replace(/:$/, "")}: ${price === undefined ? "unavailable" : `${formatKosmo(price)} Kosmo`}, across all finishes.${clickable ? ` Click to set the starting price with an adjustment of ${adjustment} Kosmo.` : ""}`;
      if (stale) badge.title += " Last known price.";
      if (canClick && !entry.editable)
        badge.title += " The starting price is read-only.";
      if (kind === "history" && entry.recordedAt)
        badge.title += ` Recorded on this browser ${new Date(entry.recordedAt).toLocaleString()}.`;
      if (kind === "history" && entry.mineLoading && price !== undefined)
        badge.title += " Saved price; checking for newer listings…";
      badge.setAttribute(
        "aria-label",
        `${label} ${text}${canClick ? `; set starting price with ${adjustment} Kosmo adjustment` : ""}${stale ? "; last known price" : ""}`,
      );
      if (badge instanceof HTMLButtonElement) {
        badge.type = "button";
        badge.disabled = !entry.editable;
        badge.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!this.valid(entry) || !editableSalesInput(entry.target.input))
            return;
          const current = this.settings!;
          if (
            kind === "sale"
              ? !current.showSalesLastSale || !current.salesLastSaleSetsPrice
              : kind === "history"
                ? !current.showSalesMyLastListing ||
                  !current.salesMyLastListingSetsPrice
                : !current.showSalesLowestListing ||
                  !current.salesLowestListingSetsPrice
          )
            return;
          try {
            if (kind === "history") {
              const account = await this.client.account();
              if (
                !this.valid(entry) ||
                account.key !== entry.myAccount ||
                !editableSalesInput(entry.target.input)
              )
                return;
            }
            const offset =
              kind === "sale"
                ? current.salesLastSaleAdjustment
                : kind === "history"
                  ? current.salesMyLastListingAdjustment
                  : current.salesLowestListingAdjustment;
            this.setPrice(
              entry,
              adjustedSalePrice(price!, offset, this.minimum(entry)),
            );
          } catch (error) {
            entry.status.className = "status error";
            entry.status.textContent = messageOf(error);
          }
        });
      } else badge.setAttribute("role", "img");
      if (kind === "history") historyBadge = badge;
      else entry.body.append(badge);
    }
    if (historyBadge || s.salesDiscountEnabled) {
      const controls = el("span", "history-controls");
      if (historyBadge) controls.append(historyBadge);
      const discount =
        s.salesDiscountEnabled && entry.discountPrice !== undefined
          ? this.discountButton(entry, entry.discountPrice)
          : undefined;
      if (discount) controls.append(discount);
      controls.append(this.refreshButton(entry));
      entry.body.append(controls);
    }
    this.updateVisibility(entry);
  }
  private refreshButton(entry: Entry) {
    const check = el("button", "price-badge history-check");
    check.type = "button";
    check.disabled = this.listingContextLost || !!entry.mineRequest;
    check.title = LISTING_REFRESH_LABEL;
    check.setAttribute("aria-label", LISTING_REFRESH_LABEL);
    check.append(headerIcon("refresh"));
    check.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.loadMyPrice(entry, true);
    });
    return check;
  }
  private minimum(entry: Entry) {
    return entry.target.rarity ? SALE_MINIMUMS[entry.target.rarity] : 1;
  }
  private setPrice(entry: Entry, value: string) {
    fillSalesInput(entry.target.input, value);
    entry.status.className = "status";
    entry.status.textContent = `Starting price set to ${value} Kosmo.`;
  }
  private discountButton(entry: Entry, price: string) {
    const settings = this.settings!,
      copyId = entry.copyId;
    const minimum = this.minimum(entry);
    const value = discountedSalePrice(
      price,
      settings.salesDiscountAmount,
      settings.salesDiscountMode,
      minimum,
    );
    if (value === adjustedSalePrice(price, 0, minimum)) return;
    const button = el("button", "price-badge discount", `Discount: $${value}`);
    button.type = "button";
    button.disabled = !entry.editable;
    button.title = `Set starting price to ${value} Kosmo.`;
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!this.valid(entry) || !editableSalesInput(entry.target.input)) return;
      try {
        const account = await this.client.account();
        const target = salesTarget(entry.target.input);
        if (
          target &&
          this.valid(entry) &&
          this.settings!.salesDiscountEnabled &&
          entry.myAccount === account.key &&
          this.selectedCopy(target) === copyId &&
          entry.discountPrice === price &&
          editableSalesInput(entry.target.input)
        )
          this.setPrice(entry, value);
      } catch (error) {
        entry.status.className = "status error";
        entry.status.textContent = messageOf(error);
      }
    });
    return button;
  }
  private mountQuickPrices(entry: Entry) {
    entry.quickHeading?.remove();
    entry.quickHeading = undefined;
    entry.quickSection?.remove();
    entry.quickSection = undefined;
    entry.quickPrices = [];
    const settings = this.settings!;
    if (!settings.salesQuickPricesEnabled || !settings.salesQuickPrices.length)
      return;
    const section = el("section", "quick-prices"),
      label = el("b", "quick-prices-label", "Quick Prices"),
      buttons = el("div", "badges");
    label.id = "quick-prices-label";
    section.setAttribute("aria-labelledby", label.id);
    for (const price of settings.salesQuickPrices) {
      const button = el(
        "button",
        "price-badge quick-price",
        `$${price.toLocaleString("en-US", { maximumFractionDigits: 6 })}`,
      );
      button.type = "button";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!this.valid(entry) || !editableSalesInput(entry.target.input))
          return;
        this.setPrice(entry, quickSalePrice(price, this.minimum(entry)));
      });
      entry.quickPrices.push(button);
      buttons.append(button);
    }
    entry.body.before(label);
    section.append(buttons);
    entry.status.before(section);
    entry.quickHeading = label;
    entry.quickSection = section;
  }
  private warning(text: string, kind: "row" | "summary" | "reconnect") {
    const warning = el("span", "", text);
    warning.setAttribute("data-kosmore-sales-warning", kind);
    warning.setAttribute("aria-live", "polite");
    warning.style.color = "#ff828b";
    return warning;
  }
  private refreshWarnings() {
    let below = false;
    const minimums =
      this.enabled() && this.settings!.salesCustomMinimumsEnabled
        ? this.settings!.salesCustomMinimums
        : undefined;
    for (const entry of this.entries.values()) {
      const { input, rarity, after } = entry.target;
      const minimum = rarity && minimums?.[rarity];
      if (
        minimum === undefined ||
        !input.isConnected ||
        !belowSaleMinimum(input.value, minimum)
      ) {
        if (entry.warning) {
          entry.warning.remove();
          entry.warning = undefined;
          this.updateVisibility(entry);
        }
        continue;
      }
      const text = `Below ${rarity} minimum of ${minimum}`;
      const warning = (entry.warning ??= this.warning(text, "row"));
      if (warning.textContent !== text) warning.textContent = text;
      if (entry.batchRow) {
        // Keep the warning out of the native price grid so it cannot move its controls.
        if (warning.parentNode !== entry.host.shadowRoot)
          (entry.quickHeading ?? entry.body).before(warning);
        this.updateVisibility(entry);
      } else {
        const parent = input.closest("label") ?? after;
        if (warning.parentElement !== parent) parent.append(warning);
      }
      below = true;
    }
    const submit = below && salesSubmitButton();
    if (submit) {
      const batch = location.pathname.endsWith("/batch");
      const text = batch
        ? "Some cards are below their configured minimums"
        : "This card is below its configured minimum";
      const warning = (this.summaryWarning ??= this.warning(text, "summary"));
      if (warning.textContent !== text) warning.textContent = text;
      if (batch) {
        if (submit.nextElementSibling !== warning) submit.after(warning);
      } else if (warning.nextElementSibling !== submit) submit.before(warning);
    } else {
      this.summaryWarning?.remove();
      this.summaryWarning = undefined;
    }
  }
  private updateVisibility(entry: Entry) {
    entry.host.hidden =
      !entry.reservedSize &&
      !entry.loading &&
      !entry.mineLoading &&
      !entry.body.children.length &&
      !entry.quickPrices.length &&
      !(entry.batchRow && entry.warning) &&
      !entry.error &&
      !entry.mineError;
  }
}
