import {
  cardOverlayTargets,
  cardOverlaysAllowed,
  contextKey,
  OVERLAY_ATTR,
  resolveCard,
} from "../kosmora/dom";
import { ApiError } from "../kosmora/client";
import type { CardContext, KosmoraClient, Settings } from "../shared/types";
import { CardSignalProvider, type CardSignals } from "./card-signals";
import { SIGNAL_BADGE_CSS, signalBadges } from "./signal-badges";
import { el } from "./ui";
import { observePage, affected, type PageChanges } from "./page-changes";
interface Entry {
  root: HTMLElement;
  context: CardContext;
  key: string;
  visible: boolean;
  done: boolean;
  loading?: boolean;
  signals?: CardSignals;
  host?: HTMLElement;
  positioned?: { value: string; priority: string };
}
const STYLE = `
:host{all:initial;position:absolute;inset:6px;container-type:inline-size;z-index:20;pointer-events:none;user-select:none;font:600 10px/1 system-ui,sans-serif}
.top-row,.bottom-row{position:absolute;left:0;right:0;display:flex;align-items:center;gap:4px;min-width:0}
.top-row{top:0;justify-content:flex-end;align-items:flex-start}.bottom-row{bottom:0;justify-content:flex-end}
.icons{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:4px;min-width:0;max-width:100%;margin-left:auto}
.signal-badge,.on-sale{box-sizing:border-box;display:flex;align-items:center;justify-content:center;flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#171027ed;border:1px solid #b6955a;box-shadow:0 1px 5px #0009;color:#f4d68c}
.signal-badge.with-price{flex-shrink:1;width:auto;min-width:22px;max-width:100%;border-radius:6px;padding:0 5px;gap:4px}
.badge-price{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${SIGNAL_BADGE_CSS}
.market-link{pointer-events:auto;cursor:pointer;text-decoration:none}.market-link:hover{filter:brightness(1.2)}.market-link:focus-visible{outline:2px solid #e7cb84;outline-offset:2px}
.on-sale{width:auto;margin-right:auto;padding:0 6px;border-radius:5px;background:#000;border-color:#fff;color:#fff;white-space:nowrap}
svg{display:block;flex-shrink:0}
@container (max-width:150px){.on-sale{font-size:9px;padding:0 4px}.bottom-row{gap:3px}.signal-badge.with-price{padding:0 4px;gap:3px;font-size:9px}}
`;
export class CardOverlays {
  private provider: CardSignalProvider;
  private settings?: Settings;
  private entries = new Map<HTMLElement, Entry>();
  private queue = new Set<Entry>();
  private intersection: IntersectionObserver;
  private running = 0;
  private scheduled = false;
  private generation = 0;
  private notBefore = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(client: KosmoraClient) {
    this.provider = new CardSignalProvider(client);
    this.intersection = new IntersectionObserver((records) => {
      for (const record of records) {
        const entry = this.entries.get(record.target as HTMLElement);
        if (!entry) continue;
        entry.visible = record.isIntersecting;
        if (entry.visible && !entry.done) this.queue.add(entry);
        else this.queue.delete(entry);
      }
      this.pump();
    });
  }
  start() {
    observePage((changes) => this.scan(changes));
    window.addEventListener("resize", () => this.schedule());
    window.addEventListener("popstate", () => this.invalidate());
    window.addEventListener("focus", () => this.invalidate(false));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.invalidate(false);
    });
    const expire = () => {
      if (!document.hidden) this.invalidate();
      setTimeout(expire, 300_000);
    };
    setTimeout(expire, 300_000);
  }
  setSettings(settings: Settings) {
    const changed =
      this.settings?.enabled !== settings.enabled ||
      this.settings?.cardOverlaysEnabled !== settings.cardOverlaysEnabled ||
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
    this.settings = settings;
    if (changed) this.invalidate();
  }
  invalidate(clear = true) {
    this.generation++;
    this.notBefore = 0;
    clearTimeout(this.timer);
    this.provider.reset();
    this.queue.clear();
    for (const entry of this.entries.values()) {
      if (clear) this.remove(entry);
      else {
        entry.done = false;
        entry.loading = false;
        if (entry.visible) this.queue.add(entry);
      }
    }
    if (clear) this.entries.clear();
    this.schedule();
  }
  signals(
    context: CardContext,
    settings: Settings,
    onProgress?: (signals: CardSignals) => void,
  ) {
    return this.provider.get(
      context.subjectId,
      settings,
      context.variant.fullArt
        ? "fullart"
        : context.variant.veil
          ? "veil"
          : "plain",
      onProgress,
      "foreground",
    );
  }
  private enabled() {
    return (
      this.settings?.enabled &&
      this.settings.cardOverlaysEnabled &&
      (this.settings?.showSaleHistoryOverlay ||
        this.settings?.showOnSaleOverlay ||
        this.settings?.showActiveAuctionsOverlay ||
        this.settings?.showFriendInterestOverlay ||
        this.settings?.showQuestOverlay)
    );
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
    if (!this.enabled()) return;
    const targets = new Map<HTMLElement, CardContext>();
    for (const scope of !changes || changes.full ? [document] : changes.roots)
      for (const [root, context] of cardOverlayTargets(document, scope))
        targets.set(root, context);
    for (const [root, entry] of this.entries) {
      if (changes && !affected(root, changes)) continue;
      const next =
        root.isConnected && cardOverlaysAllowed(root)
          ? resolveCard(root)
          : null;
      if (
        !next ||
        contextKey(next) !== entry.key ||
        root.closest('[hidden],[inert],[aria-hidden="true"]')
      ) {
        this.remove(entry);
        this.entries.delete(root);
      } else if (entry.host && !entry.host.isConnected) {
        entry.host = undefined;
        entry.done = false;
        if (entry.visible) this.queue.add(entry);
      }
    }
    for (const [root, context] of targets) {
      if (this.entries.has(root)) continue;
      const entry: Entry = {
        root,
        context,
        key: contextKey(context),
        visible: false,
        done: false,
      };
      this.entries.set(root, entry);
      this.intersection.observe(root);
    }
    this.pump();
  }
  private remove(entry: Entry) {
    this.intersection.unobserve(entry.root);
    this.queue.delete(entry);
    entry.host?.remove();
    if (
      entry.positioned &&
      entry.root.style.getPropertyValue("position") === "relative" &&
      !entry.root.style.getPropertyPriority("position")
    ) {
      if (entry.positioned.value)
        entry.root.style.setProperty(
          "position",
          entry.positioned.value,
          entry.positioned.priority,
        );
      else entry.root.style.removeProperty("position");
    }
  }
  private current(entry: Entry, generation: number) {
    const context = resolveCard(entry.root);
    return (
      generation === this.generation &&
      this.entries.get(entry.root) === entry &&
      entry.root.isConnected &&
      cardOverlaysAllowed(entry.root) &&
      !!context &&
      contextKey(context) === entry.key
    );
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
      if (Number.isFinite(this.notBefore)) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.pump(), this.notBefore - Date.now());
      }
      return;
    }
    const entry = this.queue.values().next().value!;
    this.queue.delete(entry);
    if (
      !entry.visible ||
      entry.loading ||
      !this.current(entry, this.generation)
    ) {
      this.pump();
      return;
    }
    const generation = this.generation,
      settings = this.settings!;
    this.running++;
    entry.loading = true;
    const finish = entry.context.variant.fullArt
      ? "fullart"
      : entry.context.variant.veil
        ? "veil"
        : "plain";
    void this.provider
      .get(entry.context.subjectId, settings, finish, (signals) => {
        if (this.current(entry, generation)) this.render(entry, signals);
      })
      .then(
        (signals) => {
          if (this.current(entry, generation)) {
            entry.done = true;
            this.render(entry, signals);
          }
        },
        (error) => {
          if (!this.current(entry, generation)) return;
          entry.done = true;
          if (error instanceof ApiError && error.status === 429)
            this.notBefore = error.retryAt || Date.now() + 30_000;
          if (error instanceof ApiError && error.status === 401)
            this.notBefore = Infinity;
        },
      )
      .finally(() => {
        this.running--;
        if (generation === this.generation) entry.loading = false;
        this.pump();
      });
    this.pump();
  }
  private render(entry: Entry, signals: CardSignals) {
    if (entry.signals === signals && entry.host?.isConnected) return;
    entry.signals = signals;
    if (
      !signals.onSale &&
      !signals.activeAuctions &&
      !signals.saleHistory &&
      !signals.interestedFriends &&
      !signals.quest
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
      const label = el("span", "on-sale", "For Sale");
      label.setAttribute(
        "aria-label",
        "You have this card for sale on the market",
      );
      label.title = "You have this card for sale on the market";
      top.append(label);
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
    if (getComputedStyle(entry.root).position === "static") {
      entry.positioned = {
        value: entry.root.style.getPropertyValue("position"),
        priority: entry.root.style.getPropertyPriority("position"),
      };
      entry.root.style.setProperty("position", "relative");
    }
    entry.host = host;
    if (!host.isConnected) entry.root.append(host);
  }
}
