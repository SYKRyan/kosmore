/**
 * Contract between the page-world relay (src/page-hook.ts) and the content script.
 * The relay forwards copies of market, fusion, and Vortex responses the game itself loads;
 * it never sends requests or changes what the page receives.
 */
export const RELAY_DATA = "kosmore.pageData";
export const RELAY_READY = "kosmore.relayReady";
export interface RelayPreferences {
  servicesCards?: boolean;
  packOpenings: boolean;
  inventory?: boolean;
  fusion: boolean;
  vortex: boolean;
  familyMilestones: boolean;
  saleFamily: boolean;
  listingChanges: boolean;
  listingPrices: boolean;
}
export const RELAY_PACK = "kosmore.packData";
export const BEFORE_PACK_CARD_FOCUS = "kosmore.beforePackCardFocus";
export type PackRelayMessage = {
  type: typeof RELAY_PACK;
  kind: "opening" | "identity" | "inventory";
  href?: string;
  data: unknown;
};
export const RELAY_LISTED = "kosmore.listingChanged";
export const LISTING_WRITES =
  /^\/api\/(?:auctions(?:\/[0-9a-f-]{36}\/relist)?|market\/listings\/batch)$/i;
export interface ListingChangedMessage {
  type: typeof RELAY_LISTED;
  path: string;
  confirmedAt?: number;
  listings?: import("../kosmora/listing-capture").ListingConfirmation[];
  canceled?: { auctionId: string; submittedAt: number; subjectId?: string };
}
/** Auction list/search and single-auction reads (Sale Rate). */
export const RELAY_AUCTIONS =
  /^\/api\/auctions(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i;
/** The Fusion page's recipes and card grid, and the family tier milestones (family impact). */
export const RELAY_FUSION = /^\/api\/(?:fusion|fusion\/cards|families)$/;
/** Native Vortex lobby refreshes follow spins and card choices. */
export const RELAY_VORTEX = /^\/api\/vortex\/lobby$/;
/** Everything the relay forwards; nothing else is relayed. */
export const RELAY_PATH = new RegExp(
  `${RELAY_AUCTIONS.source}|${RELAY_FUSION.source}|${RELAY_VORTEX.source}`,
  "i",
);
export const RELAY_BUFFER = 40;

export interface RelayMessage {
  type: typeof RELAY_DATA;
  path: string;
  data: unknown;
  fusionQuery?: string;
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

export const RELAY_CARDS = "kosmore.servicesCards";
export const AUCTION_DETAILS_PATH = /^\/api\/auctions\/([a-f0-9-]{36})$/i;
export const CARD_DETAILS_PATH = /^\/api\/collection\/([1-9]\d{0,17})$/;
export const CARD_PRICES_PATH = /^\/api\/cards\/([1-9]\d{0,17})\/prices$/;
export const CARD_FEED_PATH =
  /^\/api\/(?:collection(?:\/[1-9]\d{0,17})?|cards(?:\/[1-9]\d{0,17}(?:\/prices)?)?|auctions(?:\/[a-f0-9-]{36})?|me\/auctions|fusion\/cards|vortex\/lobby|market\/listings\/batch|openings\/[a-f0-9-]{36}|trade(?:s)?(?:\/[a-f0-9-]{36})?)$/i;

export interface CardFeedMessage {
  type: typeof RELAY_CARDS;
  path: string;
  ids: string[];
  data?: unknown;
  startedAt?: number;
}
