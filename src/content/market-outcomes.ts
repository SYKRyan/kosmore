import { resolveCard } from "../kosmora/dom";
import { finishOf, type Observation } from "../shared/sale-observations";
import type { Finish } from "../shared/types";
import { observePage, type PageChanges } from "./page-changes";
import type { SaleObservationStore } from "./sale-observation-store";

const TILE = "li.mk-pr-tile[data-ended]";
const AUCTION_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export interface TileOutcome {
  auctionId: string;
  subjectId: string;
  finish: Finish;
  outcome: "sold" | "unsold";
}

/** Reads a Market tile whose listing has ended (`data-ended="sold"|"noSale"`). */
export function readTileOutcome(
  tile: Element,
  doc: Document = document,
): TileOutcome | null {
  const ended = tile.getAttribute("data-ended");
  const outcome =
    ended === "sold" ? "sold" : ended === "noSale" ? "unsold" : null;
  if (!outcome) return null;
  const link = tile
    .querySelector<HTMLAnchorElement>('a[href^="/market/"]')
    ?.getAttribute("href")
    ?.match(/^\/market\/([^/?#]+)$/)?.[1];
  const auctionId = [tile.getAttribute("data-glide"), link].find(
    (id): id is string => !!id && AUCTION_ID.test(id),
  );
  // Market tiles wrap the face as `.kc-wrap > a.kc-link > .kc` (no .kc-article).
  const cardRoot = tile.querySelector(".kc-article, a.kc-link");
  const card = cardRoot ? resolveCard(cardRoot, doc) : null;
  const face = cardRoot?.querySelector(".kc");
  if (!auctionId || !card || !face) return null;
  // Same finish classes the native market uses: `kc-fa` (full art) wins over `kc-veil`.
  const finish = finishOf({
    veil: face.classList.contains("kc-veil"),
    fullArt: face.classList.contains("kc-fa"),
  });
  return {
    auctionId: auctionId.toLowerCase(),
    subjectId: card.subjectId,
    finish,
    outcome,
  };
}

/** Records Market listings as their tiles report how they ended. Sends no requests. */
export class MarketOutcomes {
  constructor(
    private store: SaleObservationStore,
    private doc: Document = document,
  ) {}
  start() {
    void this.store.load();
    observePage((changes) => this.scan(changes));
    this.scan({ roots: [], full: true });
  }
  scan(changes: PageChanges) {
    if (!this.doc.location.pathname.startsWith("/market")) return;
    const tiles = new Set<Element>();
    if (changes.full)
      for (const tile of this.doc.querySelectorAll(TILE)) tiles.add(tile);
    for (const root of changes.roots) {
      const enclosing = root.closest(TILE);
      if (enclosing) tiles.add(enclosing);
      for (const tile of root.querySelectorAll(TILE)) tiles.add(tile);
    }
    const now = Date.now();
    const entries: [string, Observation][] = [];
    for (const tile of tiles) {
      const result = readTileOutcome(tile, this.doc);
      if (!result) continue;
      const known = this.store.observations.get(result.auctionId);
      entries.push([
        result.auctionId,
        {
          subjectId: result.subjectId,
          finish: result.finish,
          outcome: result.outcome,
          // Prefer a known end time; later rescans of the same tile must not move it.
          endsAt: known ? Math.min(known.endsAt, now) : now,
        },
      ]);
    }
    if (entries.length) this.store.recordMany(entries);
  }
}
