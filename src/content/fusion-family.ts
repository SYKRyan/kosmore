import { resolveCard } from "../kosmora/dom";
import { foldFamilyName } from "../kosmora/families";
import { SALES_SUMMARY_WARNING, salesTargets } from "../kosmora/sales";
import { saleSelectionKey } from "../shared/sale-family-selection";
import { SaleFamilySelection } from "./sale-family-selection";
import {
  parseFusionCards,
  parseMilestones,
  parseRecipes,
  type FusionCard,
} from "../kosmora/fusion";
import {
  isRelayMessage,
  RELAY_FUSION,
  RELAY_VORTEX,
  RELAY_LISTED,
  LISTING_WRITES,
} from "../shared/page-relay";
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
/** Counts can change after a fusion or Vortex spin; re-read them at most this often. */
const COUNTS_GAP = 15_000;
/** Card family reads in flight at once (shared with the card overlays' cache). */
const CONCURRENCY = 2;

interface Reads {
  onAccountChange(listener: () => void): unknown;
  familyCounts(
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<Map<string, number>>;
  invalidateFamilyCounts?(): void;
  familyCountsFor?(
    ids: string[],
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
.pending{background:#282a30f2;border-color:#858994;color:#d2d5dc}
.wait{border-style:dashed}
@container (max-width:130px){.verdict{gap:3px;padding:0 5px;font-size:9px}}
`;

/**
 * Family impact on Fusion, Trade, Vortex, and sales: each card you could pick is marked
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
  /** All memberships, including families that do not affect tiers. No extra reads. */
  private cardFamilies = new Map<string, CardFamily[]>();
  /** Total ownership across finishes and availability, not only tradable copies. */
  private owned = new Map<string, number>();
  private freshOwned = new Set<string>();
  private ownershipRevision = 0;
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
  private work = new AbortController();
  private retry?: ReturnType<typeof setTimeout>;
  private sales: SaleFamilySelection;

  constructor(
    private client: Reads,
    private win: Window = window,
    private gap = COUNTS_GAP,
    private now: () => number = Date.now,
  ) {
    this.sales = new SaleFamilySelection(win, () => this.schedule());
  }

  start() {
    const onMessage = (event: MessageEvent) => {
      if (
        event.source === this.win &&
        event.origin === this.win.location.origin &&
        event.data?.type === RELAY_LISTED &&
        typeof event.data.path === "string" &&
        LISTING_WRITES.test(event.data.path)
      ) {
        this.invalidateOwnership();
        this.schedule();
        return;
      }
      if (
        event.source !== this.win ||
        event.origin !== this.win.location.origin ||
        !isRelayMessage(event.data) ||
        (!RELAY_FUSION.test(event.data.path) &&
          !RELAY_VORTEX.test(event.data.path))
      )
        return;
      this.receive(event.data.path, event.data.data);
    };
    this.win.addEventListener("message", onMessage);
    const stopSales = this.sales.start(() => this.salesEnabled());
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
    const unobserve = observePage(() => {
      if (
        this.hosts.size ||
        this.loading ||
        this.reading.size ||
        this.enabled()
      )
        this.schedule();
    });
    // Cards can be gained or lost in another tab (packs, sales, gifts): re-read
    // counts when the player comes back to this one.
    const back = () => {
      if (this.win.document.hidden || !this.enabled()) return;
      this.invalidateOwnership();
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
      this.sales.reset();
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
      stopSales();
      this.intersection?.disconnect();
      this.visible.clear();
      this.observed.clear();
      this.stopReads();
      this.win.cancelAnimationFrame(this.frame);
      this.frame = 0;
      clearTimeout(this.retry);
      this.retry = undefined;
      this.clear();
    };
  }
  stop() {}

  setSettings(settings: Settings) {
    const salesEnabled = this.salesEnabled();
    this.settings = settings;
    if (salesEnabled && !this.salesEnabled()) this.sales.reset();
    if (!this.enabled()) this.stopReads();
    this.schedule();
  }

  /** A relayed copy of the game's own `/api/fusion`, `/api/fusion/cards` or `/api/families`. */
  receive(path: string, data: unknown) {
    try {
      if (RELAY_VORTEX.test(path)) this.invalidateOwnership();
      else if (path === "/api/families")
        this.milestones = parseMilestones(data);
      else if (path === "/api/fusion") this.recipes = parseRecipes(data);
      else {
        let reload = false;
        for (const card of parseFusionCards(data)) {
          reload ||= this.cards.has(card.subjectId);
          this.cards.set(card.subjectId, card);
        }
        // Cards seen before mean a reload (as after a fusion), not the next
        // page of the grid: counts may have changed.
        if (reload) this.invalidateCounts();
      }
    } catch {
      return;
    }
    this.schedule();
  }

  enabled() {
    return (
      !!this.settings?.familyImpactOverlaysEnabled &&
      ((this.settings.showFusionFamilyOverlay &&
        this.win.location.pathname === "/fusion") ||
        (this.settings.showTradeFamilyOverlay && this.trading()) ||
        (this.settings.showVortexFamilyOverlay && this.vortex()) ||
        (this.salesEnabled() && this.selling()))
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

  private vortex() {
    return this.win.location.pathname === "/vortex";
  }

  private salesEnabled() {
    return (
      !!this.settings?.familyImpactOverlaysEnabled &&
      this.settings.showSalesFamilyOverlay
    );
  }

  private selling() {
    return (
      /^\/market\/sell(?:\/batch)?$/.test(this.win.location.pathname) ||
      !!this.sales.activePicker()
    );
  }

  private invalidateCounts() {
    this.ownershipRevision++;
    this.countsStale = true;
    this.client.invalidateFamilyCounts?.();
  }

  private invalidateOwnership() {
    this.invalidateCounts();
    for (const id of [...this.owned.keys(), ...this.reading])
      this.freshOwned.add(id);
    this.owned.clear();
  }

  private stopReads() {
    this.sales.clearPicker();
    if (this.work.signal.aborted) return;
    this.work.abort();
    if (this.loading) this.countsStale = true;
    this.loading = false;
    this.reading.clear();
    this.intersection?.disconnect();
    this.observed.clear();
    this.visible.clear();
    this.accountCheck = undefined;
    clearTimeout(this.retry);
    this.retry = undefined;
  }

  private schedule() {
    if (this.frame) return;
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private load(subjects?: Iterable<string>) {
    if (this.client.familyCountsFor && !subjects) return;
    const scope =
      subjects && this.client.familyCountsFor
        ? [
            ...new Set(
              [...subjects].flatMap((id) =>
                (this.families.get(id) ?? []).map((family) => family.id),
              ),
            ),
          ]
        : undefined;
    if (scope && !scope.length) {
      if (!this.wanted.size) return;
      if (
        this.countsStale &&
        [...this.wanted].every((id) => this.families.has(id))
      ) {
        this.counts = undefined;
        this.countsStale = false;
      }
      this.counts ??= new Map();
    }
    const missing = scope?.filter(
      (id) => this.countsStale || !this.counts?.has(id),
    );
    const counts = missing
        ? missing.length > 0
        : !this.counts || this.countsStale,
      milestones = !this.milestones;
    if (this.loading || (!counts && !milestones)) return;
    // Never skip a refresh, only delay it, so a quick fusion still gets one.
    const wait =
      Math.max(
        this.failedAt,
        counts && (this.countsStale || (!scope && this.counts))
          ? this.countsAt
          : 0,
      ) +
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
    const signal = this.work.signal;
    const generation = this.generation;
    const ownershipRevision = this.ownershipRevision;
    const freshCounts = this.countsStale || (!scope && !!this.counts);
    // Cleared now, not on arrival: a fusion during the read marks it stale again.
    if (counts) {
      if (scope && this.countsStale) this.counts = undefined;
      this.countsStale = false;
    }
    void Promise.all([
      counts
        ? (missing
            ? this.client.familyCountsFor!(missing, signal, freshCounts)
            : this.client.familyCounts(signal, freshCounts)
          ).then(
            (next) => {
              if (signal.aborted || generation !== this.generation) return;
              this.countsAt = this.now();
              if (ownershipRevision !== this.ownershipRevision) return;
              this.counts =
                missing && this.counts
                  ? new Map([...this.counts, ...next])
                  : next;
              if (missing?.some((id) => !next.has(id)))
                this.failedAt = this.countsAt;
            },
            (error: unknown) => {
              if (!signal.aborted) this.countsStale = true;
              throw error;
            },
          )
        : undefined,
      milestones
        ? this.client.familyMilestones(signal).then((m) => {
            if (!signal.aborted) this.milestones = m;
          })
        : undefined,
    ])
      .catch(() => {
        // Wait before retrying rather than reading on every page change.
        if (!signal.aborted) this.failedAt = this.now();
      })
      .finally(() => {
        if (signal.aborted) return;
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
    const signal = this.work.signal;
    this.accountCheck ??= this.client.account(signal, false).then(
      () => {
        if (signal.aborted) return;
        this.accountKnown = true;
        this.schedule();
      },
      () => {
        if (signal.aborted) return;
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
        (this.families.has(id) &&
          (!(this.trading() || this.vortex() || this.selling()) ||
            this.owned.has(id)))
      )
        continue;
      if (this.now() - (this.failed.get(id) ?? 0) < this.gap) continue;
      this.reading.add(id);
      const signal = this.work.signal;
      const generation = this.generation;
      const ownershipRevision = this.ownershipRevision;
      const read = this.client.insights(id, signal, this.freshOwned.has(id));
      // The card overlays queue several reads per card; a badge needs only this
      // one, so it goes first (shared with the overlays, never an extra request).
      this.client.expediteCard?.(id);
      void read
        .then((card) => {
          if (
            signal.aborted ||
            generation !== this.generation ||
            ownershipRevision !== this.ownershipRevision
          )
            return;
          if (card.copies) this.owned.set(id, card.copies.length);
          else if (this.trading() || this.vortex() || this.selling())
            this.failed.set(id, this.now());
          this.freshOwned.delete(id);
          // Only memberships that count toward tiers (as Kosmora's own tiers).
          if (card.families) {
            this.cardFamilies.set(id, card.families);
            this.families.set(
              id,
              card.families.filter((f) => f.economic !== false),
            );
          } else {
            this.cardFamilies.delete(id);
            this.families.delete(id);
            this.failed.set(id, this.now());
          }
        })
        .catch(() => {
          if (!signal.aborted) this.failed.set(id, this.now());
        })
        .finally(() => {
          if (signal.aborted) return;
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
    if (!this.enabled()) {
      this.stopReads();
      return this.clear();
    }
    if (this.work.signal.aborted) this.work = new AbortController();
    if (this.selling()) {
      const salePicks = this.sales.pickerSelection();
      const ready = this.accountReady();
      if (ready) this.load();
      return this.renderSales(salePicks, ready);
    }
    if (!this.accountReady()) return this.clear();
    if (this.trading() || this.vortex()) {
      this.load();
      return this.renderSingleCopy();
    }
    const chosen = this.chosen();
    // A fusion empties the tray: counts may have changed.
    if (this.trayHadCards && !chosen.length) this.invalidateCounts();
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
    this.load(this.wanted);
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
        subjectId: card.subjectId,
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

  /** Like Fusion's tray: selected last copies count once per subject and family. */
  private renderSales(picks: Set<string>, accountReady: boolean) {
    const doc = this.win.document,
      picker = this.sales.activePicker();
    const targets = salesTargets(doc);
    const selected = picker ? picks : this.sales.batchSelection(targets);
    const tiles: {
      root: HTMLElement;
      id: string;
      key: string;
      after?: HTMLElement;
    }[] = [];
    if (picker) {
      for (const article of picker.querySelectorAll<HTMLElement>(
        ".pick .kc-article",
      )) {
        const card = resolveCard(article, doc);
        if (card)
          tiles.push({
            root: article,
            id: card.subjectId,
            key: saleSelectionKey(card),
          });
      }
    } else
      for (const target of targets.values())
        tiles.push({
          root: target.input,
          id: target.context.subjectId,
          key: saleSelectionKey(target.context),
          after: target.after,
        });
    const current = new Set(tiles.map((tile) => tile.root));
    for (const [root, host] of this.hosts)
      if (!current.has(root)) {
        host.remove();
        this.hosts.delete(root);
      }
    const pending = (tile: (typeof tiles)[number], text = "Calculating…") =>
      this.draw(
        tile.root,
        null,
        {
          subjectId: tile.id,
          picked: false,
          action: "sell",
          pendingText: text,
        },
        tile.after,
      );
    const pendingAll = (text?: string) => {
      for (const tile of tiles) pending(tile, text);
    };
    for (const root of current)
      if (!this.observed.has(root)) {
        this.observed.add(root);
        this.intersection?.observe(root);
      }
    for (const root of this.observed)
      if (!current.has(root as HTMLElement)) {
        this.observed.delete(root);
        this.visible.delete(root);
        this.intersection?.unobserve(root);
      }
    const picked = new Map<string, number>();
    for (const key of selected ?? []) {
      const id = key.split(".")[0];
      picked.set(id, (picked.get(id) ?? 0) + 1);
    }
    this.wanted = new Set([
      ...picked.keys(),
      ...tiles
        .filter((tile) => this.visible.has(tile.root))
        .map((tile) => tile.id),
    ]);
    if (accountReady) {
      this.readFamilies();
      if (this.client.familyCountsFor) this.load(this.wanted);
    }
    if (
      !accountReady ||
      !selected ||
      !this.counts ||
      !this.milestones ||
      this.countsStale ||
      this.loading
    )
      return pendingAll(
        this.failedAt && !this.loading ? "Impact unavailable" : undefined,
      );
    const leaving = new Map<string, number>();
    for (const [id, n] of picked) {
      const families = this.families.get(id),
        quantity = this.owned.get(id);
      if (!families || !quantity || n > quantity)
        return pendingAll(
          this.failed.has(id) ||
            quantity === 0 ||
            (quantity !== undefined && n > quantity)
            ? "Impact unavailable"
            : undefined,
        );
      if (n < quantity) continue;
      for (const family of families)
        leaving.set(family.id, (leaving.get(family.id) ?? 0) + 1);
    }
    for (const tile of tiles) {
      const families = this.families.get(tile.id),
        quantity = this.owned.get(tile.id);
      if (!families || !quantity) {
        pending(
          tile,
          this.failed.has(tile.id) || quantity === 0
            ? "Impact unavailable"
            : undefined,
        );
        continue;
      }
      const chosenN = picked.get(tile.id) ?? 0;
      const copies = chosenN + (selected.has(tile.key) ? 0 : 1);
      if (copies > quantity) {
        pending(tile, "Impact unavailable");
        continue;
      }
      const others = new Map(leaving);
      if (chosenN >= quantity)
        for (const family of families)
          others.set(family.id, (others.get(family.id) ?? 1) - 1);
      // Keep an already-crossed threshold visible when several cards from the
      // same family leave together, rather than judging only the final step.
      const verdict = fusionVerdict(
        families,
        copies >= quantity,
        this.counts,
        others,
        this.milestones,
        true,
      );
      if (!verdict) {
        pending(tile, "Impact unavailable");
        continue;
      }
      this.draw(
        tile.root,
        verdict,
        { subjectId: tile.id, picked: selected.has(tile.key), action: "sell" },
        tile.after,
      );
    }
  }

  /** Trades and Vortex stakes risk one copy, including any copies kept elsewhere. */
  private renderSingleCopy() {
    const vortex = this.vortex();
    const tiles: [HTMLElement, string][] = [];
    for (const article of this.win.document.querySelectorAll<HTMLElement>(
      vortex
        ? '[data-testid="vx-stake-card"] .kc-article, [data-testid="vx-picker-grid"] .kc-article'
        : "main .sx-new-trade .sx-picks .sx-pick .kc-article",
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
    if (this.client.familyCountsFor) this.load(this.wanted);
    const seen = new Set<HTMLElement>();
    if (
      this.counts &&
      this.milestones &&
      (!vortex || (!this.countsStale && !this.loading))
    )
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
        this.draw(article, verdict, {
          subjectId: id,
          picked: true,
          action: vortex ? "vortex" : "trade",
        });
      }
    for (const [article, host] of this.hosts)
      if (!seen.has(article)) {
        host.remove();
        this.hosts.delete(article);
      }
  }

  private draw(
    article: HTMLElement,
    verdict: Verdict | null,
    state: {
      subjectId: string;
      picked: boolean;
      waiting?: number;
      action?: "trade" | "vortex" | "sell";
      pendingText?: string;
    },
    saleAfter?: HTMLElement,
  ) {
    let { parts, label } = verdict
      ? describe(verdict, state)
      : {
          parts: [["fixed", state.pendingText ?? "Calculating…"]],
          label: state.pendingText ?? "Calculating family impact…",
        };
    // This is intentionally render-only and opt-in. Tier-loss and pending
    // badges skip the match, and enabling it never starts another card read.
    let blacklisted = false;
    if (verdict?.safe && this.settings?.useFamilyBlacklist) {
      const blocked = new Set(
        this.settings.familyBlacklist.map(foldFamilyName),
      );
      const matches = (this.cardFamilies.get(state.subjectId) ?? []).filter(
        (family) => blocked.has(foldFamilyName(family.name)),
      );
      if (matches.length) {
        blacklisted = true;
        parts = [["fixed", "Blacklist"]];
        label = `Blacklist: ${matches.map((family) => family.name).join(", ")}. ${label}`;
      }
    }
    const sig = `${blacklisted ? "blacklist" : (verdict?.safe ?? "pending")}|${label}`;
    // On the card art when there is one, so no card text is covered.
    const submit = saleAfter
      ?.closest("form.sell-form")
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    const warning = submit?.previousElementSibling;
    const before = warning?.matches(SALES_SUMMARY_WARNING) ? warning : submit;
    const after = saleAfter?.nextElementSibling?.matches(
      "[data-kosmore-sales-overlay]",
    )
      ? saleAfter.nextElementSibling
      : saleAfter;
    const anchor =
      before?.parentElement ??
      saleAfter?.parentElement ??
      article.querySelector<HTMLElement>(".kc-window") ??
      article;
    let host = this.hosts.get(article);
    if (
      host?.isConnected &&
      host.parentElement === anchor &&
      (before
        ? host.nextElementSibling === before
        : !after || host.previousElementSibling === after) &&
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
    const batchSale = !!saleAfter?.closest(".bsell-row");
    style.textContent =
      STYLE +
      (saleAfter
        ? `:host{position:static;display:block;inset:auto;height:28px;min-width:0;grid-column:1/-1;margin:6px 0 ${batchSale ? 0 : 10}px;font-size:12px;z-index:auto;text-align:${batchSale ? "right" : "center"}}.verdict{height:28px;padding:4px 8px}`
        : "");
    const badge = el(
      "div",
      `verdict ${blacklisted ? "drop blacklist" : !verdict ? "pending" : verdict.safe ? "safe" : "drop"}${state.waiting ? " wait" : ""}`,
    );
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", label);
    badge.append(...parts.map(([cls, text]) => el("span", cls, text)));
    host.shadowRoot!.replaceChildren(style, badge);
    if (!saleAfter && this.win.getComputedStyle(anchor).position === "static")
      anchor.style.setProperty("position", "relative");
    if (before) before.before(host);
    else if (after) after.after(host);
    else if (host.parentElement !== anchor) anchor.append(host);
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
  state: {
    picked: boolean;
    waiting?: number;
    action?: "trade" | "vortex" | "sell";
  },
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
      label: `${wait}Not safe: ${state.action === "vortex" ? "losing" : state.action === "trade" ? "trading" : state.action === "sell" ? "selling" : picked ? "fusing" : "picking"} this card${state.action === "vortex" ? " in the Vortex" : state.action === "sell" ? " with the rest of the sale selection" : ""} drops ${verdict.drops.map(lost).join(", and ")}.`,
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
    label: `${wait}${state.action === "vortex" ? "Family tiers safe if this copy is lost in the Vortex" : state.action === "sell" ? "Safe to sell with the rest of the sale selection" : `Safe to ${state.action === "trade" ? "trade" : "fuse"}`}: ${why}`,
  };
}
