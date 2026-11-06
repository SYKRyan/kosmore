/**
 * Contract between the page-world relay (src/page-hook.ts) and the content script.
 * The relay forwards copies of market responses the game itself loads; it never
 * sends requests or changes what the page receives.
 */
export const RELAY_DATA = "kosmore.pageData";
export const RELAY_READY = "kosmore.relayReady";
/** Only the auction list/search and single-auction reads are relayed. */
export const RELAY_PATH =
  /^\/api\/auctions(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i;
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
