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
import { signalBadges } from "./signal-badges";
import { el } from "./ui";
interface Entry {
  root: HTMLElement;
  context: CardContext;
  key: string;
  visible: boolean;
  done: boolean;
  host?: HTMLElement;
  positioned?: { value: string; priority: string };
}
const STYLE = `:host{all:initial;position:absolute;inset:6px 6px auto auto;display:flex;gap:4px;z-index:20;pointer-events:none;user-select:none}span{box-sizing:border-box;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#171027ed;border:1px solid #b6955a;box-shadow:0 1px 5px #0009;color:#f4d68c}.friend{color:#d1b7fc;border-color:#9a7fc6}svg{display:block}`;
export class CardOverlays {
  private provider: CardSignalProvider;
  private settings?: Settings;
  private entries = new Map<HTMLElement, Entry>();
  private queue = new Set<Entry>();
  private intersection: IntersectionObserver;
  private running = false;
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
    const observer = new MutationObserver(() => this.schedule());
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "class",
        "href",
        "src",
        "hidden",
        "aria-hidden",
        "inert",
        "style",
      ],
    });
    window.addEventListener("resize", () => this.schedule());
    window.addEventListener("popstate", () => this.invalidate());
    window.addEventListener("focus", () => this.invalidate());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.invalidate();
    });
    const expire = () => {
      if (!document.hidden) this.invalidate();
      setTimeout(expire, 300_000);
    };
    setTimeout(expire, 300_000);
  }
  setSettings(settings: Settings) {
    const changed =
      this.settings?.showSaleHistoryOverlay !==
        settings.showSaleHistoryOverlay ||
      this.settings?.showFriendInterestOverlay !==
        settings.showFriendInterestOverlay ||
      this.settings?.showQuestOverlay !== settings.showQuestOverlay;
    this.settings = settings;
    if (changed) this.invalidate();
  }
  invalidate() {
    this.generation++;
    this.notBefore = 0;
    clearTimeout(this.timer);
    this.provider.reset();
    this.queue.clear();
    for (const entry of this.entries.values()) this.remove(entry);
    this.entries.clear();
    this.schedule();
  }
  signals(context: CardContext, settings: Settings) {
    return this.provider.get(
      context.subjectId,
      settings,
      context.variant.fullArt
        ? "fullart"
        : context.variant.veil
          ? "veil"
          : "plain",
    );
  }
  private enabled() {
    return (
      this.settings?.showSaleHistoryOverlay ||
      this.settings?.showFriendInterestOverlay ||
      this.settings?.showQuestOverlay
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
  private scan() {
    if (!this.enabled()) return;
    const targets = cardOverlayTargets();
    for (const [root, entry] of this.entries) {
      const next = targets.get(root);
      if (
        !next ||
        contextKey(next) !== entry.key ||
        !root.getClientRects().length ||
        getComputedStyle(root).visibility === "hidden"
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
      if (
        this.entries.has(root) ||
        !root.getClientRects().length ||
        getComputedStyle(root).visibility === "hidden"
      )
        continue;
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
    if (this.running || !this.enabled() || document.hidden || !this.queue.size)
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
    if (!entry.visible || !this.current(entry, this.generation)) {
      this.pump();
      return;
    }
    const generation = this.generation,
      settings = this.settings!;
    this.running = true;
    const finish = entry.context.variant.fullArt
      ? "fullart"
      : entry.context.variant.veil
        ? "veil"
        : "plain";
    void this.provider
      .get(entry.context.subjectId, settings, finish)
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
        this.running = false;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.pump(), 400);
      });
  }
  private render(entry: Entry, signals: CardSignals) {
    if (!signals.saleHistory && !signals.interestedFriends && !signals.quest)
      return;
    const host = el("span");
    host.setAttribute(OVERLAY_ATTR, "");
    const shadow = host.attachShadow({ mode: "open" }),
      style = el("style");
    style.textContent = STYLE;
    shadow.append(style);
    shadow.append(...signalBadges(signals, this.settings!));
    if (getComputedStyle(entry.root).position === "static") {
      entry.positioned = {
        value: entry.root.style.getPropertyValue("position"),
        priority: entry.root.style.getPropertyPriority("position"),
      };
      entry.root.style.setProperty("position", "relative");
    }
    entry.host = host;
    entry.root.append(host);
  }
}
