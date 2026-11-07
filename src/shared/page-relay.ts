/**
 * Contract between the page-world relay (src/page-hook.ts) and the content script.
 * The relay forwards copies of market and fusion responses the game itself loads;
 * it never sends requests or changes what the page receives.
 */
export const RELAY_DATA = "kosmore.pageData";
export const RELAY_READY = "kosmore.relayReady";
export const RELAY_LISTED = "kosmore.listingChanged";
export const LISTING_WRITES = /^\/api\/(?:auctions|market\/listings\/batch)$/;
export interface ListingChangedMessage {
  type: typeof RELAY_LISTED;
  path: string;
}
/** Auction list/search and single-auction reads (Sale Rate). */
export const RELAY_AUCTIONS =
  /^\/api\/auctions(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i;
/** The Fusion page's recipes and card grid, and the family tier milestones (family impact). */
export const RELAY_FUSION = /^\/api\/(?:fusion|fusion\/cards|families)$/;
/** Everything the relay forwards; nothing else is relayed. */
export const RELAY_PATH = new RegExp(
  `${RELAY_AUCTIONS.source}|${RELAY_FUSION.source}`,
  "i",
);
export const RELAY_BUFFER = 40;

export interface RelayMessage {
  type: typeof RELAY_DATA;
  path: string;
  data: unknown;
}

export function isRelayMessage(value: unknown): value is RelayMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<RelayMessage>;
  return (
    m.type === RELAY_DATA &&
    typeof m.path === "string" &&
    RELAY_PATH.test(m.path) &&
    "data" in m
  );
}
