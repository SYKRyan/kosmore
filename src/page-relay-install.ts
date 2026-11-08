/**
 * KosMore page-world relay, installed by src/page-hook.ts (MAIN world, document_start).
 *
 * Kosmora's auction search never reports listings that ended unsold, so the Sale
 * Rate stat needs to see the listings the game shows you. Fusion family impact
 * needs the recipes and cards the Fusion page loads. This script passes copies of
 * the game's own successful `GET /api/auctions`, `GET /api/auctions/{id}`,
 * `GET /api/fusion`, `GET /api/fusion/cards`, `GET /api/families`, and
 * `GET /api/vortex/lobby` responses to
 * the content script. Successful native single/batch listing submissions also
 * emit an invalidation-only notification, without their request body or prices.
 * The observer sends no requests and returns the page's response untouched.
 */
import {
  RELAY_BUFFER,
  RELAY_DATA,
  RELAY_PATH,
  RELAY_READY,
  type RelayMessage,
  RELAY_LISTED,
  LISTING_WRITES,
  type ListingChangedMessage,
} from "./shared/page-relay";

declare global {
  interface Window {
    __kosmoreRelay?: boolean;
  }
}

export function installPageRelay(win: Window = window) {
  if (win.__kosmoreRelay) return;
  win.__kosmoreRelay = true;
  const original = win.fetch;
  const buffer: (RelayMessage | ListingChangedMessage)[] = [];
  let ready = false;
  const send = (message: RelayMessage | ListingChangedMessage) =>
    win.postMessage(message, win.location.origin);
  const relay = (message: RelayMessage | ListingChangedMessage) => {
    if (ready) send(message);
    else {
      buffer.push(message);
      if (buffer.length > RELAY_BUFFER) buffer.shift();
    }
  };
  // The content script loads at document_idle and announces itself; flush then.
  win.addEventListener("message", (event) => {
    if (
      !ready &&
      event.source === win &&
      (event.data as { type?: unknown } | null)?.type === RELAY_READY
    ) {
      ready = true;
      for (const message of buffer.splice(0)) send(message);
    }
  });
  win.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const response = original.apply(this, args);
    try {
      const [input, init] = args;
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        win.location.href,
      );
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (
        method === "POST" &&
        url.origin === win.location.origin &&
        LISTING_WRITES.test(url.pathname)
      ) {
        void response
          .then(async (res) => {
            if (!res.ok) return;
            const data = (await res.clone().json()) as {
              auctionId?: unknown;
              listed?: unknown;
            };
            const changed =
              url.pathname === "/api/auctions"
                ? typeof data.auctionId === "string" &&
                  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
                    data.auctionId,
                  )
                : typeof data.listed === "number" && data.listed > 0;
            if (changed) relay({ type: RELAY_LISTED, path: url.pathname });
          })
          .catch(() => {});
      }
      if (
        method === "GET" &&
        url.origin === win.location.origin &&
        RELAY_PATH.test(url.pathname)
      )
        response
          .then((res) => {
            if (!res.ok) return;
            return res
              .clone()
              .json()
              .then((data: unknown) =>
                relay({ type: RELAY_DATA, path: url.pathname, data }),
              );
          })
          .catch(() => {});
    } catch {
      // Relaying is best effort and must never affect the page's request.
    }
    return response;
  } as typeof fetch;
}
