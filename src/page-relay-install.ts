import { parseOpening, parseReadyPackIds } from "./kosmora/contracts";
import { listingConfirmations, saleSubjects } from "./kosmora/listing-capture";
/**
 * KosMore page-world relay, installed by src/page-hook.ts (MAIN world, document_start).
 *
 * Kosmora's auction search never reports listings that ended unsold, so the Sale
 * Rate stat needs to see the listings the game shows you. Fusion family impact
 * needs the recipes and cards the Fusion page loads. This script passes copies of
 * the game's own successful `GET /api/auctions`, `GET /api/auctions/{id}`,
 * `GET /api/fusion`, `GET /api/fusion/cards`, `GET /api/families`, and
 * `GET /api/vortex/lobby` responses to
 * the content script. Native batch reads and draft updates also pass selection
 * identities only, so family checks include filtered-out entries. Successful
 * native single/batch listing submissions also
 * emit an invalidation-only notification, without their request body or prices.
 * The observer sends no requests and returns the page's response untouched.
 */
import {
  RELAY_BUFFER,
  RELAY_PACK,
  type PackRelayMessage,
  RELAY_DATA,
  RELAY_PATH,
  RELAY_READY,
  RELAY_AUCTIONS,
  type RelayPreferences,
  type RelayMessage,
  RELAY_LISTED,
  LISTING_WRITES,
  type ListingChangedMessage,
} from "./shared/page-relay";
import {
  RELAY_SALE_BATCH,
  saleSelection,
  type SaleBatchMessage,
} from "./shared/sale-family-selection";

declare global {
  interface Window {
    __kosmoreRelay?: boolean;
  }
}

export function installPageRelay(win: Window = window) {
  if (win.__kosmoreRelay) return;
  win.__kosmoreRelay = true;
  const original = win.fetch;
  const buffer: (
    | RelayMessage
    | ListingChangedMessage
    | SaleBatchMessage
    | PackRelayMessage
    | (() => void)
  )[] = [];
  let revision = 0;
  const subjects = new Map<string, string>();
  const rememberSubjects = (value: unknown) => {
    for (const [id, subject] of saleSubjects(value)) subjects.set(id, subject);
    while (subjects.size > 1000) subjects.delete(subjects.keys().next().value!);
  };
  let ready = false;
  let preferences: RelayPreferences | undefined;
  let observationEpoch = 0;
  const send = (
    message:
      | RelayMessage
      | ListingChangedMessage
      | SaleBatchMessage
      | PackRelayMessage,
  ) => win.postMessage(message, win.location.origin);
  const relay = (
    message:
      | RelayMessage
      | ListingChangedMessage
      | SaleBatchMessage
      | PackRelayMessage,
  ) => {
    if (ready) send(message);
    else {
      buffer.push(message);
      if (buffer.length > RELAY_BUFFER) buffer.shift();
    }
  };
  win.addEventListener("message", (event) => {
    if (
      event.source !== win ||
      event.origin !== win.location.origin ||
      event.data?.type !== RELAY_READY
    )
      return;
    const previous = preferences?.collectSaleRateData;
    preferences = event.data.preferences;
    if (previous !== undefined && previous !== preferences?.collectSaleRateData)
      observationEpoch++;
    if (ready) return;
    ready = true;
    for (const item of buffer.splice(0))
      if (typeof item === "function") item();
      else send(item);
  });
  win.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    // fetch consumes a Request body synchronously; clone the specific draft
    // request first, without ever consuming or replacing the original body.
    let draftRequest: Request | undefined;
    let listingRequest: Request | undefined;
    const submittedAt = Date.now();
    try {
      const [input, init] = args;
      if (
        input instanceof Request &&
        init?.body === undefined &&
        (init?.method ?? input.method).toUpperCase() === "POST"
      ) {
        const url = new URL(input.url);
        if (
          url.origin === win.location.origin &&
          LISTING_WRITES.test(url.pathname) &&
          preferences?.listingPrices !== false
        )
          listingRequest = input.clone();
      }
      if (
        input instanceof Request &&
        init?.body === undefined &&
        (init?.method ?? input.method).toUpperCase() === "PUT" &&
        win.location.pathname === "/market/sell/batch"
      ) {
        const url = new URL(input.url);
        if (
          url.origin === win.location.origin &&
          url.pathname === "/api/market/sell-draft"
        )
          draftRequest = input.clone();
      }
    } catch {}
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
      const packPath = /^\/api\/openings\/([a-f0-9-]{36})(\/open)?$/i.exec(
        url.pathname,
      );
      if (
        url.origin === win.location.origin &&
        ((url.pathname === "/api/packs/inventory" &&
          preferences?.packInventory !== false) ||
          (packPath &&
            (packPath[2]
              ? preferences?.packInventory !== false
              : preferences?.packOpenings !== false)))
      ) {
        void response
          .then(async (res) => {
            if (!res.ok) return;
            if (method === "GET" && url.pathname === "/api/packs/inventory") {
              relay({
                type: RELAY_PACK,
                kind: "inventory",
                ids: parseReadyPackIds(await res.clone().json()),
                requestedAt: submittedAt,
              });
            } else if (method === "GET" && packPath && !packPath[2]) {
              const cards = parseOpening(await res.clone().json());
              if (
                cards.length &&
                cards[0].openingId.toLowerCase() === packPath[1].toLowerCase()
              )
                relay({
                  type: RELAY_PACK,
                  kind: "opening",
                  data: {
                    id: cards[0].openingId,
                    cards: cards.map((card) => ({
                      slot: card.slot,
                      subjectId: card.subjectId,
                      instanceId: card.instanceId,
                      rarity: card.rarity,
                      veil: card.variant.veil,
                      card: { fullArt: card.variant.fullArt },
                    })),
                  },
                });
            } else if (method === "POST" && packPath?.[2]) {
              relay({ type: RELAY_PACK, kind: "opened", id: packPath[1] });
            }
          })
          .catch(() => {});
      }
      // Keep filtered-out sale entries in the impact calculation. Observe only
      // the game's own batch reads and draft writes; never request or save one.
      if (
        url.origin === win.location.origin &&
        win.location.pathname === "/market/sell/batch" &&
        ((method === "GET" &&
          url.pathname === "/api/market/listings/batch" &&
          (preferences?.saleFamily !== false ||
            preferences?.listingPrices !== false)) ||
          (method === "PUT" &&
            url.pathname === "/api/market/sell-draft" &&
            (preferences?.saleFamily !== false ||
              preferences?.listingPrices !== false)))
      ) {
        const page = win.location.href,
          nextRevision = ++revision;
        const source = method === "GET" ? "batch" : "draft";
        const data =
          source === "batch"
            ? response.then((res) => (res.ok ? res.clone().json() : undefined))
            : typeof init?.body === "string"
              ? Promise.resolve().then(() => JSON.parse(init.body as string))
              : draftRequest
                ? draftRequest.json()
                : Promise.resolve(undefined);
        void data
          .then((value: unknown) => {
            if (
              source === "batch" &&
              value &&
              preferences?.listingPrices !== false
            )
              rememberSubjects(value);
            const selection = saleSelection(value, source);
            if (!selection) return;
            const { keys, copies } = selection;
            const includeCopies =
              preferences?.listingPrices !== false && copies.length > 0;
            if (
              preferences?.saleFamily !== false ||
              includeCopies ||
              (source === "draft" && preferences?.listingPrices !== false)
            )
              relay({
                type: RELAY_SALE_BATCH,
                page,
                revision: nextRevision,
                source,
                keys,
                ...(includeCopies ? { copies } : {}),
              });
          })
          .catch(() => {});
      }
      if (
        method === "GET" &&
        url.origin === win.location.origin &&
        win.location.pathname === "/market/sell" &&
        preferences?.listingPrices !== false &&
        /^\/api\/collection\/\d+$/.test(url.pathname)
      ) {
        void response
          .then(async (res) => {
            if (!res.ok) return;
            const data = await res.clone().json();
            const subject = url.pathname.split("/").pop();
            if (
              String(data?.subjectId) !== subject ||
              !Array.isArray(data.copies)
            )
              return;
            for (const [id, card] of saleSubjects({
              items: data.copies.map((copy: { id?: unknown }) => ({
                instanceId: copy?.id,
                subjectId: subject,
              })),
            }))
              subjects.set(id, card);
          })
          .catch(() => {});
      }
      if (
        method === "POST" &&
        url.origin === win.location.origin &&
        LISTING_WRITES.test(url.pathname) &&
        preferences?.listingChanges !== false
      ) {
        const trackPrices = preferences?.listingPrices !== false;
        const knownSubjects = trackPrices
          ? new Map(subjects)
          : new Map<string, string>();
        const body = !trackPrices
          ? undefined
          : typeof init?.body === "string"
            ? Promise.resolve()
                .then(() => JSON.parse(init.body as string))
                .catch(() => undefined)
            : listingRequest?.json().catch(() => undefined);
        void response
          .then(async (res) => {
            if (!res.ok) return;
            const result = await res.clone().json();
            const listings = listingConfirmations(
              url.pathname,
              await body,
              result,
              submittedAt,
              knownSubjects,
            );
            if (
              listings.length ||
              (url.pathname.endsWith("/batch") && result?.listed > 0)
            )
              relay({ type: RELAY_LISTED, path: url.pathname, listings });
          })
          .catch(() => {});
      }
      if (
        method === "GET" &&
        url.origin === win.location.origin &&
        RELAY_PATH.test(url.pathname)
      ) {
        const auction = RELAY_AUCTIONS.test(url.pathname);
        const enabled = () =>
          auction
            ? preferences?.collectSaleRateData !== false
            : url.pathname === "/api/families"
              ? preferences?.familyMilestones !== false
              : url.pathname === "/api/vortex/lobby"
                ? preferences?.vortex !== false
                : preferences?.fusion !== false;
        const epoch = observationEpoch;
        if (enabled())
          void response
            .then((res) => {
              if (
                !res.ok ||
                !enabled() ||
                (auction && epoch !== observationEpoch)
              )
                return;
              const copy = res.clone();
              const forward = () => {
                if (!enabled() || (auction && epoch !== observationEpoch)) {
                  void copy.body?.cancel().catch(() => {});
                  return;
                }
                void copy
                  .json()
                  .then((data: unknown) => {
                    if (enabled() && (!auction || epoch === observationEpoch))
                      relay({ type: RELAY_DATA, path: url.pathname, data });
                  })
                  .catch(() => {});
              };
              if (auction && !ready) {
                buffer.push(forward);
                if (buffer.length > RELAY_BUFFER) buffer.shift();
              } else forward();
            })
            .catch(() => {});
      }
    } catch {
      // Relaying is best effort and must never affect the page's request.
    }
    return response;
  } as typeof fetch;
}
