import { resolveCard } from "../kosmora/dom";
import {
  parseFusionCards,
  parseMilestones,
  parseRecipes,
  type FusionCard,
} from "../kosmora/fusion";
import { isRelayMessage, RELAY_FUSION } from "../shared/page-relay";
import {
  fusionVerdict,
  tierName,
  type FamilyEffect,
  type Verdict,
} from "../shared/fusion-family";
import type { CardFamily, OwnedCopy, Settings } from "../shared/types";
import { observePage } from "./page-changes";
import { el } from "./ui";

export const FUSION_FAMILY_ATTR = "data-kosmore-fusion-family";
/** Counts can change after a fusion; re-read them at most this often. */
const COUNTS_GAP = 15_000;
/** Card family reads in flight at once (shared with the card overlays' cache). */
const CONCURRENCY = 2;

interface Reads {
  onAccountChange(listener: () => void): unknown;
  familyCounts(
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<Map<string, number>>;
  familyMilestones(signal?: AbortSignal): Promise<number[]>;
  insights(
    subjectId: string,
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<{ families: CardFamily[] | null; copies?: OwnedCopy[] }>;
  expediteCard?(subjectId: string): void;
  /** The signed-in account; card reads are cached per account. */
  account?(signal?: AbortSignal, fresh?: boolean): Promise<unknown>;
}

// Bottom left of the card art, clear of the card's text and of the other badges.
const STYLE = `
:host{all:initial;position:absolute;left:6px;right:6px;bottom:6px;height:22px;container-type:inline-size;z-index:21;pointer-events:none;user-select:none;font:700 10px/1 system-ui,sans-serif}
.verdict{box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;height:22px;max-width:100%;padding:0 7px;border-radius:6px;border:1px solid;box-shadow:0 1px 5px #0009;white-space:nowrap}
.name{min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.fixed{flex-shrink:0}
.safe{background:#0f2118f0;border-color:#5fbf8a;color:#9be3b9}
.drop{background:#3a0d14f2;border-color:#ff6b78;color:#ffd0d4}
.wait{border-style:dashed}
@container (max-width:130px){.verdict{gap:3px;padding:0 5px;font-size:9px}}
`;

/**
 * Family impact on the game's Fusion page: each card you could pick is marked
 * "✓ Safe" or, when fusing it drops one of its families a tier,
 * "⚠ Loses <Family> <tier>", counting the cards already in the tray.
 * Reads the game's own grid and milestone responses (via the page relay), your
 * family counts, and each visible card's families. Never picks, clicks or
 * changes the game's controls.
 */
export class FusionFamilyImpact {
  private settings?: Settings;
  private cards = new Map<string, FusionCard>();
  /** Every family each card belongs to (the grid only names the primary one). */
  private families = new Map<string, CardFamily[]>();
  /** Total ownership across finishes and availability, not only tradable copies. */
  private owned = new Map<string, number>();
  private freshOwned = new Set<string>();
  private generation = 0;
  private wanted = new Set<string>();
  private reading = new Set<string>();
  private failed = new Map<string, number>();
  private milestones?: number[];
  /** Cards per fusion, per rarity (the game's own recipes). */
  private recipes?: Map<string, number>;
  private trayHadCards = false;
  private accountKnown = false;
  private accountCheck?: Promise<unknown>;
  private accountFailedAt = 0;
  private counts?: Map<string, number>;
  private countsAt = 0;
  private countsStale = false;
  private failedAt = 0;
  private loading = false;
  private hosts = new Map<HTMLElement, HTMLElement>();
  private visible = new Set<Element>();
  private observed = new Set<Element>();
  private intersection?: IntersectionObserver;
  private frame = 0;
  private retry?: ReturnType<typeof setTimeout>;

  constructor(
    private client: Reads,
    private win: Window = window,
    private gap = COUNTS_GAP,
    private now: () => number = Date.now,
  ) {}

  start() {
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== this.win ||
        event.origin !== this.win.location.origin ||
        !isRelayMessage(event.data) ||
        !RELAY_FUSION.test(event.data.path)
      )
        return;
      this.receive(event.data.path, event.data.data);
    };
    this.win.addEventListener("message", onMessage);
    // Half a screen ahead, so badges are ready as cards scroll into view. Kept
    // small: every read shares the player's rate limit with the game itself.
    this.intersection = new IntersectionObserver(
      (records) => {
        for (const record of records)
          if (record.isIntersecting) this.visible.add(record.target);
          else this.visible.delete(record.target);
        this.schedule();
      },
      { rootMargin: "50% 0px" },
    );
    const unobserve = observePage(() => this.schedule());
    // Cards can be gained or lost in another tab (packs, sales, gifts): re-read
    // counts when the player comes back to this one.
    const back = () => {
      if (this.win.document.hidden) return;
      this.countsStale = true;
      for (const id of this.owned.keys()) this.freshOwned.add(id);
      this.owned.clear();
      this.schedule();
    };
    this.win.addEventListener("focus", back);
    this.win.document.addEventListener("visibilitychange", back);
    // Grid cards hold one account's copy counts.
    this.client.onAccountChange(() => {
      this.generation++;
      this.cards.clear();
      this.owned.clear();
      this.freshOwned.clear();
      this.counts = undefined;
      // Reads in flight for the old account fail: start over without waiting.
      this.accountKnown = false;
      this.accountCheck = undefined;
      this.failedAt = this.accountFailedAt = 0;
      this.schedule();
    });
    this.stop = () => {
      this.win.removeEventListener("message", onMessage);
      this.win.removeEventListener("focus", back);
      this.win.document.removeEventListener("visibilitychange", back);
      unobserve();
      this.intersection?.disconnect();
      this.visible.clear();
      this.observed.clear();
      this.win.cancelAnimationFrame(this.frame);
      this.frame = 0;
      clearTimeout(this.retry);
      this.retry = undefined;
      this.clear();
    };
  }
  stop() {}

  setSettings(settings: Settings) {
    this.settings = settings;
    this.schedule();
  }

  /** A relayed copy of the game's own `/api/fusion`, `/api/fusion/cards` or `/api/families`. */
  receive(path: string, data: unknown) {
    try {
      if (path === "/api/families") this.milestones = parseMilestones(data);
      else if (path === "/api/fusion") this.recipes = parseRecipes(data);
      else {
        let reload = false;
        for (const card of parseFusionCards(data)) {
          reload ||= this.cards.has(card.subjectId);
          this.cards.set(card.subjectId, card);
        }
        // Cards seen before mean a reload (as after a fusion), not the next
        // page of the grid: counts may have changed.
        if (reload) this.countsStale = true;
      }
    } catch {
      return;
    }
    this.schedule();
  }

  private enabled() {
    return (
      !!this.settings?.cardOverlaysEnabled &&
      ((this.settings.showFusionFamilyOverlay &&
        this.win.location.pathname === "/fusion") ||
        (this.settings.showTradeFamilyOverlay && this.trading()))
    );
  }

  private trading() {
    return (
      this.win.location.pathname === "/trades/new" &&
      !!this.win.document.querySelector(
        'main .sx-new-trade [data-testid="trade-mine-filters"]',
      )
    );
  }

  private schedule() {
    if (this.frame) return;
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private load() {
    const counts = !this.counts || this.countsStale,
      milestones = !this.milestones;
    if (this.loading || (!counts && !milestones)) return;
    // Never skip a refresh, only delay it, so a quick fusion still gets one.
    const wait =
      Math.max(this.failedAt, counts && this.counts ? this.countsAt : 0) +
      this.gap -
      this.now();
    if (wait > 0) {
      if (!this.retry)
        this.retry = setTimeout(() => {
          this.retry = undefined;
          this.schedule();
        }, wait);
      return;
    }
    this.loading = true;
    const generation = this.generation;
    // Cleared now, not on arrival: a fusion during the read marks it stale again.
    if (counts) this.countsStale = false;
    void Promise.all([
      counts
        ? this.client.familyCounts(undefined, !!this.counts).then(
            (next) => {
              if (generation !== this.generation) return;
              this.counts = next;
              this.countsAt = this.now();
            },
            (error: unknown) => {
              this.countsStale = true;
              throw error;
            },
          )
        : undefined,
      milestones
        ? this.client.familyMilestones().then((m) => (this.milestones = m))
        : undefined,
    ])
      .catch(() => {
        // Wait before retrying rather than reading on every page change.
        this.failedAt = this.now();
      })
      .finally(() => {
        this.loading = false;
        this.schedule();
      });
  }

  /**
   * Reads are cached per signed-in account, and confirming the account clears
   * that cache and cancels reads in flight. Waiting for it first (as the card
   * overlays do) means no read is lost, and badges and overlays share each one.
   */
  private accountReady() {
    if (this.accountKnown || !this.client.account) return true;
    if (this.now() - this.accountFailedAt < this.gap) return false;
    this.accountCheck ??= this.client.account(undefined, false).then(
      () => {
        this.accountKnown = true;
        this.schedule();
      },
      () => {
        this.accountCheck = undefined;
        this.accountFailedAt = this.now();
      },
    );
    return false;
  }

  /** Reads the families of wanted cards, a few at a time. */
  private readFamilies() {
    for (const id of this.wanted) {
      if (this.reading.size >= CONCURRENCY) return;
      if (
        this.reading.has(id) ||
        (this.families.has(id) && (!this.trading() || this.owned.has(id)))
      )
        continue;
      if (this.now() - (this.failed.get(id) ?? 0) < this.gap) continue;
      this.reading.add(id);
      const generation = this.generation;
      const read = this.client.insights(id, undefined, this.freshOwned.has(id));
      // The card overlays queue several reads per card; a badge needs only this
      // one, so it goes first (shared with the overlays, never an extra request).
      this.client.expediteCard?.(id);
      void read
        .then((card) => {
          if (generation !== this.generation) return;
          if (card.copies) this.owned.set(id, card.copies.length);
          this.freshOwned.delete(id);
          // Only memberships that count toward tiers (as Kosmora's own tiers).
          if (card.families)
            this.families.set(
              id,
              card.families.filter((f) => f.economic !== false),
            );
          else {
            this.families.delete(id);
            this.failed.set(id, this.now());
          }
        })
        .catch(() => this.failed.set(id, this.now()))
        .finally(() => {
          this.reading.delete(id);
          this.schedule();
        });
    }
  }

  /** Subject ids in the game's tray, one per filled slot, in the order chosen. */
  private chosen() {
    const chosen: string[] = [];
    for (const slot of this.win.document.querySelectorAll(
      ".fu-slots .fu-slot-on .kc-article",
    )) {
      const id = slot
        .querySelector("img.kc-img")
        ?.getAttribute("src")
        ?.match(/\/media\/cards\/(\d+)\//)?.[1];
      if (id) chosen.push(id);
    }
    return chosen;
  }

  private render() {
    if (!this.enabled()) return this.clear();
    if (!this.accountReady()) return this.clear();
    this.load();
    if (this.trading()) return this.renderTrade();
    const chosen = this.chosen();
    // A fusion empties the tray: counts may have changed.
    if (this.trayHadCards && !chosen.length) this.countsStale = true;
    this.trayHadCards = chosen.length > 0;
    // The game fuses complete batches only, taking cards in the order chosen
    // (checked live): later cards wait for the batch to fill.
    const cost = this.recipes?.get(this.cards.get(chosen[0])?.rarity ?? ""),
      fusedN = cost ? chosen.length - (chosen.length % cost) : chosen.length;
    const fused = new Map<string, number>(),
      picked = new Map<string, number>();
    chosen.forEach((id, i) => {
      picked.set(id, (picked.get(id) ?? 0) + 1);
      if (i < fusedN) fused.set(id, (fused.get(id) ?? 0) + 1);
    });
    const tiles: [HTMLElement, FusionCard][] = [];
    for (const pick of this.win.document.querySelectorAll<HTMLElement>(
      ".pick",
    )) {
      const article = pick.querySelector<HTMLElement>(".kc-article");
      const context = article && resolveCard(article, this.win.document);
      const card = context && this.cards.get(context.subjectId);
      if (!article || !card) continue;
      tiles.push([article, card]);
    }
    const current = new Set<Element>(tiles.map(([article]) => article));
    for (const article of current)
      if (!this.observed.has(article)) {
        this.observed.add(article);
        this.intersection?.observe(article);
      }
    for (const article of this.observed)
      if (!current.has(article)) {
        this.observed.delete(article);
        this.visible.delete(article);
        this.intersection?.unobserve(article);
      }
    // Families are read for cards near the screen and in the tray only.
    this.wanted = new Set([
      ...chosen,
      ...tiles
        .filter(([article]) => this.visible.has(article))
        .map(([, card]) => card.subjectId),
    ]);
    this.readFamilies();
    if (!this.counts || !this.milestones) return this.clear();
    // Cards that leave the collection (every copy fused), per family: for the
    // batches Fuse would run now, and for everything in the tray.
    const leavingOf = (cards: Map<string, number>) => {
      const leaving = new Map<string, number>();
      for (const [id, n] of cards) {
        const card = this.cards.get(id);
        if (!card || n < card.quantity) continue;
        const families = this.families.get(id);
        if (!families) return null;
        for (const f of families)
          leaving.set(f.id, (leaving.get(f.id) ?? 0) + 1);
      }
      return leaving;
    };
    const leavingNow = leavingOf(fused),
      leavingAll = leavingOf(picked);
    // A chosen card's families must be known before any other card is judged.
    if (!leavingNow || !leavingAll) return this.clear();
    const seen = new Set<HTMLElement>();
    for (const [article, card] of tiles) {
      const families = this.families.get(card.subjectId);
      if (!families) continue;
      const inFusion = fused.get(card.subjectId) ?? 0,
        chosenN = picked.get(card.subjectId) ?? 0;
      // Cards are fused in the order chosen, so fusing this card fuses every
      // card chosen before it. In a complete batch: judged with the batches
      // Fuse would run. Waiting or not chosen: judged with the whole tray.
      const copies = inFusion || chosenN || 1,
        leaves = copies >= card.quantity,
        base = inFusion ? leavingNow : leavingAll,
        counted = inFusion ? inFusion : chosenN;
      const others = new Map(base);
      if (counted >= card.quantity)
        for (const f of families) others.set(f.id, (others.get(f.id) ?? 1) - 1);
      const verdict = fusionVerdict(
        families,
        leaves,
        this.counts,
        others,
        this.milestones,
      );
      if (!verdict) continue;
      seen.add(article);
      this.draw(article, verdict, {
        picked: chosenN > 0,
        waiting: chosenN > 0 && !inFusion ? cost : undefined,
      });
    }
    for (const [article, host] of this.hosts)
      if (!seen.has(article)) {
        host.remove();
        this.hosts.delete(article);
      }
  }

  /** A trade gives one copy; family membership only leaves with the last owned copy. */
  private renderTrade() {
    const tiles: [HTMLElement, string][] = [];
    for (const article of this.win.document.querySelectorAll<HTMLElement>(
      "main .sx-new-trade .sx-picks .sx-pick .kc-article",
    )) {
      const context = resolveCard(article, this.win.document);
      if (context) tiles.push([article, context.subjectId]);
    }
    const current = new Set<Element>(tiles.map(([article]) => article));
    for (const article of current)
      if (!this.observed.has(article)) {
        this.observed.add(article);
        this.intersection?.observe(article);
      }
    for (const article of this.observed)
      if (!current.has(article)) {
        this.observed.delete(article);
        this.visible.delete(article);
        this.intersection?.unobserve(article);
      }
    this.wanted = new Set(
      tiles
        .filter(([article]) => this.visible.has(article))
        .map(([, id]) => id),
    );
    this.readFamilies();
    const seen = new Set<HTMLElement>();
    if (this.counts && this.milestones)
      for (const [article, id] of tiles) {
        const families = this.families.get(id),
          quantity = this.owned.get(id);
        // Unknown or empty ownership never gets a reassuring Safe badge.
        if (!families || !quantity) continue;
        const verdict = fusionVerdict(
          families,
          quantity === 1,
          this.counts,
          new Map(),
          this.milestones,
        );
        if (!verdict) continue;
        seen.add(article);
        this.draw(article, verdict, { picked: true, action: "trade" });
      }
    for (const [article, host] of this.hosts)
      if (!seen.has(article)) {
        host.remove();
        this.hosts.delete(article);
      }
  }

  private draw(
    article: HTMLElement,
    verdict: Verdict,
    state: { picked: boolean; waiting?: number; action?: "trade" },
  ) {
    const { parts, label } = describe(verdict, state);
    const sig = `${verdict.safe}|${label}`;
    // On the card art when there is one, so no card text is covered.
    const anchor = article.querySelector<HTMLElement>(".kc-window") ?? article;
    let host = this.hosts.get(article);
    if (
      host?.isConnected &&
      host.parentElement === anchor &&
      host.dataset.sig === sig
    )
      return;
    if (!host) {
      host = el("span");
      host.setAttribute(FUSION_FAMILY_ATTR, "");
      host.attachShadow({ mode: "open" });
      this.hosts.set(article, host);
    }
    host.dataset.sig = sig;
    const style = el("style");
    style.textContent = STYLE;
    const badge = el(
      "div",
      `verdict ${verdict.safe ? "safe" : "drop"}${state.waiting ? " wait" : ""}`,
    );
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", label);
    badge.append(...parts.map(([cls, text]) => el("span", cls, text)));
    host.shadowRoot!.replaceChildren(style, badge);
    if (this.win.getComputedStyle(anchor).position === "static")
      anchor.style.setProperty("position", "relative");
    if (host.parentElement !== anchor) anchor.append(host);
  }

  private clear() {
    for (const host of this.hosts.values()) host.remove();
    this.hosts.clear();
  }
}

const lost = (e: FamilyEffect) =>
  `${e.name} from tier ${tierName(e.tierBefore)} to ${tierName(e.tierAfter)}`;
const kept = (e: FamilyEffect) =>
  e.tierBefore === 0
    ? `${e.name} has no tier to lose`
    : `${e.name} keeps tier ${tierName(e.tierBefore)}${
        e.more
          ? ` (${e.more} more of its cards can go after this one)`
          : ", but this is the last of its cards that can go"
      }`;

/** Badge pieces ([class, text]: only "name" may be shortened) and the full label. */
export function describe(
  verdict: Verdict,
  state: { picked: boolean; waiting?: number; action?: "trade" },
): { parts: [string, string][]; label: string } {
  const { picked } = state;
  // Chosen, but outside the complete batches the game will fuse.
  const wait = state.waiting
    ? `Not in this fusion yet: the game fuses ${state.waiting} cards at a time, in the order chosen. Once it is: `
    : "";
  if (!verdict.safe) {
    const [first, ...rest] = verdict.drops;
    return {
      parts: [
        ["fixed", "⚠ Loses"],
        ["name", first.name],
        [
          "fixed",
          `${tierName(first.tierBefore)}${rest.length ? ` +${rest.length}` : ""}`,
        ],
      ],
      label: `${wait}Not safe: ${state.action === "trade" ? "trading" : picked ? "fusing" : "picking"} this card drops ${verdict.drops.map(lost).join(", and ")}.`,
    };
  }
  const why =
    verdict.reason === "no-family"
      ? "this card doesn't count toward any family tier."
      : verdict.reason === "spare"
        ? `you keep another copy, so ${verdict.families.map((f) => f.name).join(" and ")} keep${verdict.families.length === 1 ? "s" : ""} its count.`
        : `${verdict.families.map(kept).join("; ")}.`;
  return {
    parts: [["fixed", "✓ Safe"]],
    label: `${wait}Safe to ${state.action === "trade" ? "trade" : "fuse"}: ${why}`,
  };
}
