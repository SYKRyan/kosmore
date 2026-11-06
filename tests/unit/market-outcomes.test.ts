import { afterEach, beforeEach, expect, it } from "vitest";
import {
  MarketOutcomes,
  readTileOutcome,
} from "../../src/content/market-outcomes";
import { SaleObservationStore } from "../../src/content/sale-observation-store";

const AUCTION = "beef75e0-0387-4d3c-b7f1-a2eef52a1e57";
// Mirrors the live Market grid (checked 2026-11-05): ended tiles gain data-ended,
// and the face is `.kc-wrap > a.kc-link[href=/market/{id}] > .kc.kc-<rarity>`.
function tile(ended: string | null, extra = "", auction = AUCTION) {
  const attr = ended === null ? "" : ` data-ended="${ended}"`;
  return (
    `<ul><li class="mk-pr-tile" data-glide="${auction}"${attr}>` +
    `<div class="kc-wrap">` +
    `<a class="kc-link" href="/market/${auction}" aria-label="Sample card, Common, Family">` +
    `<div class="kc kc-common ${extra}"><div class="kc-tilt"><div class="kc-frame">` +
    `<header class="kc-plate"><span class="kc-name">Sample card</span></header>` +
    `<div class="kc-window"><img class="kc-img" src="/media/cards/608611/b7f2/thumb.webp"></div>` +
    `<footer class="kc-foot"><span data-testid="card-corner">No. 608611</span></footer>` +
    `</div></div></div></a>` +
    `<div class="kc-under"><button class="price-plate" data-testid="price-plate">75 1 bid Sold</button></div>` +
    `</div></li></ul>`
  );
}
beforeEach(() => history.replaceState(null, "", "/market"));
afterEach(() => {
  document.body.innerHTML = "";
  history.replaceState(null, "", "/collection");
});

it("reads sold and no-sale tiles with their auction, card and finish", () => {
  document.body.innerHTML = tile("sold", "kc-veil");
  expect(readTileOutcome(document.querySelector("li")!)).toEqual({
    auctionId: AUCTION,
    subjectId: "608611",
    finish: "veil",
    outcome: "sold",
  });
  document.body.innerHTML = tile("noSale");
  expect(readTileOutcome(document.querySelector("li")!)).toMatchObject({
    finish: "plain",
    outcome: "unsold",
  });
  document.body.innerHTML = tile("sold", "kc-veil kc-fa");
  expect(readTileOutcome(document.querySelector("li")!)?.finish).toBe(
    "fullart",
  );
});

it("ignores open, unfamiliar and unidentifiable tiles", () => {
  for (const ended of [null, "", "cancelled"]) {
    document.body.innerHTML = tile(ended);
    expect(readTileOutcome(document.querySelector("li")!)).toBeNull();
  }
  document.body.innerHTML = tile("sold", "", "not-a-uuid");
  expect(readTileOutcome(document.querySelector("li")!)).toBeNull();
});

it("records ended tiles on Market pages only, keeping the first end time", () => {
  const store = new SaleObservationStore(undefined);
  const outcomes = new MarketOutcomes(store);
  document.body.innerHTML = tile("noSale");
  outcomes.scan({ roots: [document.body], full: false });
  const first = store.observations.get(AUCTION)!;
  expect(first).toMatchObject({ subjectId: "608611", outcome: "unsold" });
  outcomes.scan({ roots: [], full: true });
  expect(store.observations.get(AUCTION)!.endsAt).toBe(first.endsAt);

  const other = new SaleObservationStore(undefined);
  history.replaceState(null, "", "/collection");
  new MarketOutcomes(other).scan({ roots: [], full: true });
  expect(other.observations.size).toBe(0);
});

it("upgrades a listing first seen open to its tile outcome at its known end time", () => {
  const store = new SaleObservationStore(undefined);
  const endsAt = Date.now() - 5_000;
  store.record(AUCTION, {
    subjectId: "608611",
    finish: "plain",
    outcome: "open",
    endsAt,
  });
  document.body.innerHTML = tile("sold");
  new MarketOutcomes(store).scan({ roots: [], full: true });
  expect(store.observations.get(AUCTION)).toEqual({
    subjectId: "608611",
    finish: "plain",
    outcome: "sold",
    endsAt,
  });
});
