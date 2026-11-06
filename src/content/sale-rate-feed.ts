import { parseObservedAuctions } from "../kosmora/auctions";
import {
  isRelayMessage,
  RELAY_AUCTIONS,
  RELAY_READY,
} from "../shared/page-relay";
import { resolveWithHistory } from "../shared/sale-observations";
import type { MarketHistory } from "../shared/types";
import type { SaleObservationStore } from "./sale-observation-store";

/**
 * Records listings from the game's own auction responses, relayed by page-hook.ts.
 * Malformed or foreign messages are ignored; at worst they could only skew this
 * browser's local statistics.
 */
export function listenToPageRelay(
  store: SaleObservationStore,
  win: Window = window,
) {
  win.addEventListener("message", (event) => {
    if (
      event.source !== win ||
      event.origin !== win.location.origin ||
      !isRelayMessage(event.data) ||
      !RELAY_AUCTIONS.test(event.data.path)
    )
      return;
    store.recordMany(
      parseObservedAuctions(event.data.data).map((auction) => [
        auction.id,
        {
          subjectId: auction.subjectId,
          finish: auction.finish,
          outcome: auction.outcome,
          endsAt: auction.endsAt,
        },
      ]),
    );
  });
  // Release anything the relay buffered before this script loaded.
  win.postMessage({ type: RELAY_READY }, win.location.origin);
}

/**
 * Settles observed listings from price histories as they arrive from the network.
 * Uses the fetch time, not the current time, so a cached history can never be
 * mistaken for evidence gathered after a listing ended.
 */
export class HistoryResolver {
  constructor(private store: SaleObservationStore) {}
  receive(subjectId: string, history: MarketHistory, loadedAt: number) {
    const changed = resolveWithHistory(
      this.store.observations,
      subjectId,
      history,
      loadedAt,
    );
    if (changed.length) this.store.resolved(changed);
  }
}
