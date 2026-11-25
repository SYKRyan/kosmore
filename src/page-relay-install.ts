import { validCardId } from "./shared/services";
import { parseOpening } from "./kosmora/contracts";
import { salesTargets } from "./kosmora/sales";
import {
  listingConfirmations,
  listingSubmission,
  listingSubjectId,
  saleSubjects,
} from "./kosmora/listing-capture";
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
  RELAY_CARDS,
  RELAY_FUSION_RESULTS,
  type FusionResultsMessage,
  CARD_FEED_PATH,
  CARD_DETAILS_PATH,
  AUCTION_DETAILS_PATH,
  CARD_PRICES_PATH,
  type CardFeedMessage,
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
    | CardFeedMessage
    | FusionResultsMessage
    | PackRelayMessage
    | (() => void)
  )[] = [];
  let revision = 0;
  const subjects = new Map<string, string>();
  const auctionSubjects = new Map<string, string>();
  const copyFinishes = new Map<string, import("./shared/types").Finish>();
  const rememberSubjects = (value: unknown) => {
    for (const [id, subject] of saleSubjects(value, copyFinishes)) subjects.set(id, subject);
    while (copyFinishes.size > 1000) copyFinishes.delete(copyFinishes.keys().next().value!);
    while (subjects.size > 1000) subjects.delete(subjects.keys().next().value!);
  };
  const decodingSubjects = new Set<Promise<unknown>>();
  function decodeSource(response: Response) {
    const decoding = response.clone().json();
    decodingSubjects.add(decoding);
    void decoding
      .finally(() => decodingSubjects.delete(decoding))
      .catch(() => {});
    return decoding;
  }
  let ready = false;
  let preferences: RelayPreferences | undefined;
  const send = (
    message:
      | RelayMessage
      | ListingChangedMessage
      | SaleBatchMessage
      | CardFeedMessage
      | FusionResultsMessage
      | PackRelayMessage,
  ) => win.postMessage(message, win.location.origin);
  const relay = (
    message:
      | RelayMessage
      | ListingChangedMessage
      | SaleBatchMessage
      | CardFeedMessage
      | FusionResultsMessage
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
    preferences = event.data.preferences;
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
      const copySubject = CARD_DETAILS_PATH.exec(url.pathname)?.[1];
      const trackCopies = copySubject && preferences?.listingPrices !== false;
      if (
        method === "POST" &&
        url.origin === win.location.origin &&
        (url.pathname === "/api/fusion/mass" || url.pathname === "/api/fusion") &&
        (!ready || preferences?.servicesCards)
      ) {
        void response.then(async (res) => {
          if (!res.ok || (ready && !preferences?.servicesCards)) return;
          const data = await res.clone().json();
          const cards = data?.cards ?? (data?.card ? [data.card] : undefined);
          if (!Array.isArray(cards)) return;
          const ids = new Set<string>();
          for (const row of cards) {
            const subject = row?.subjectId;
            const id = Number.isSafeInteger(subject) ? String(subject) : subject;
            if (validCardId(id)) ids.add(id);
          }
          const results = [...ids];
          // The haul initially renders only its first twelve new cards.
          for (let i = 0; i < results.length; i += 500)
            relay({
              type: RELAY_FUSION_RESULTS,
              ids: results.slice(i, i + 500),
              first: i === 0,
            });
        }).catch(() => {});
      }
      if (
        method === "GET" &&
        url.origin === win.location.origin &&
        CARD_FEED_PATH.test(url.pathname) &&
        (!ready || preferences?.servicesCards || trackCopies)
      ) {
        void response
          .then(async (res) => {
            if (
              !res.ok ||
              (ready && !preferences?.servicesCards && !trackCopies)
            )
              return;
            const ownListings =
              AUCTION_DETAILS_PATH.test(url.pathname) ||
              url.pathname === "/api/me/auctions";
            const data =
              trackCopies || ownListings
                ? await decodeSource(res)
                : await res.clone().json();
            if (ownListings) {
              const rows = Array.isArray(data?.items)
                ? data.items
                : [data?.auction];
              for (const row of rows) {
                const subject = listingSubjectId(row?.card?.subjectId);
                if (
                  row?.yours === true &&
                  typeof row.id === "string" &&
                  subject
                )
                  auctionSubjects.set(row.id.toLowerCase(), subject);
              }
              if (Array.isArray(data?.relistAll?.items))
                rememberSubjects({
                  items: data.relistAll.items.map(
                    (item: { auctionId?: string; instanceId?: string }) => ({
                      instanceId: item?.instanceId,
                      subjectId:
                        typeof item?.auctionId === "string"
                          ? auctionSubjects.get(item.auctionId.toLowerCase())
                          : undefined,
                    }),
                  ),
                });
            }
            if (
              trackCopies &&
              preferences?.listingPrices !== false &&
              String(data?.subjectId) === copySubject &&
              Array.isArray(data.copies)
            ) {
              for (const copy of data.copies)
                if (typeof copy?.auction_id === "string")
                  auctionSubjects.set(
                    copy.auction_id.toLowerCase(),
                    copySubject,
                  );
              rememberSubjects({
                items: data.copies.map((copy: { id?: unknown }) => ({
                  ...copy,
                  instanceId: copy?.id,
                  subjectId: copySubject,
                })),
              });
            }
            while (auctionSubjects.size > 1000)
              auctionSubjects.delete(auctionSubjects.keys().next().value!);
            if (ready && !preferences?.servicesCards) return;
            const ids = observedCardIds(url.pathname, data);
            const needsNativeData =
              CARD_DETAILS_PATH.test(url.pathname) ||
              (preferences?.listingPrices !== false &&
                AUCTION_DETAILS_PATH.test(url.pathname) &&
                (data as { auction?: { yours?: boolean } } | null)?.auction
                  ?.yours === true) ||
              CARD_PRICES_PATH.test(url.pathname) ||
              ["/api/fusion/copies", "/api/me/auctions"].includes(
                url.pathname,
              ) ||
              (url.pathname === "/api/collection" &&
                url.searchParams.get("sendable") === "1");
            if (!ids.length && !needsNativeData) return;
            const deliver = () => {
              if (preferences?.servicesCards)
                relay({
                  type: RELAY_CARDS,
                  path: url.pathname + url.search,
                  ids,
                  startedAt: submittedAt,
                  ...(needsNativeData && { data }),
                });
            };
            if (ready) deliver();
            else {
              buffer.push(deliver);
              if (buffer.length > RELAY_BUFFER) buffer.shift();
            }
          })
          .catch(() => {});
      }
      if (
        method === "GET" &&
        url.origin === win.location.origin &&
        (url.pathname === "/api/me" ||
          (url.pathname === "/api/packs/inventory" && !url.search))
      ) {
        const href = win.location.href;
        const identity = url.pathname === "/api/me";
        void response
          .then(async (res) => {
            if (!res.ok && !(identity && res.status === 401)) return;
            const data = res.ok ? await res.clone().json() : null;
            const deliver = () => {
              if (identity)
                relay({
                  type: RELAY_PACK,
                  kind: "identity",
                  data: data?.handle
                    ? {
                        handle: data.handle,
                        currentOpening: data.currentOpening
                          ? { id: data.currentOpening.id }
                          : undefined,
                      }
                    : null,
                });
              else if (
                preferences?.inventory &&
                Array.isArray(data?.packs) &&
                !data.next &&
                !data.cursor &&
                !data.hasMore &&
                (data.total === undefined || data.total === data.packs.length)
              )
                relay({
                  type: RELAY_PACK,
                  kind: "inventory",
                  href,
                  data: {
                    packs: data.packs.map(
                      (p: { status?: string; openingId?: string }) => ({
                        status: p.status,
                        openingId: p.openingId,
                      }),
                    ),
                  },
                });
            };
            if (ready) deliver();
            else {
              buffer.push(deliver);
              if (buffer.length > RELAY_BUFFER) buffer.shift();
            }
          })
          .catch(() => {});
      }
      const packPath = /^\/api\/openings\/([a-f0-9-]{36})$/i.exec(url.pathname);
      if (
        method === "GET" &&
        packPath &&
        url.origin === win.location.origin &&
        preferences?.packOpenings !== false
      ) {
        void response
          .then(async (res) => {
            if (!res.ok) return;
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
          })
          .catch(() => {});
      }
      // Keep filtered-out sale entries in the impact calculation. Observe only
      // the game's own batch reads and draft writes; never request or save one.
      if (
        url.origin === win.location.origin &&
        ((method === "GET" &&
          url.pathname === "/api/market/listings/batch" &&
          (preferences?.saleFamily !== false ||
            preferences?.listingPrices !== false)) ||
          (method === "PUT" &&
            win.location.pathname === "/market/sell/batch" &&
            url.pathname === "/api/market/sell-draft" &&
            (preferences?.saleFamily !== false ||
              preferences?.listingPrices !== false)))
      ) {
        const page = win.location.href,
          nextRevision = ++revision;
        const onBatchPage = win.location.pathname === "/market/sell/batch";
        const source = method === "GET" ? "batch" : "draft";
        const data =
          source === "batch"
            ? response.then((res) => (res.ok ? decodeSource(res) : undefined))
            : typeof init?.body === "string"
              ? Promise.resolve().then(() => JSON.parse(init.body as string))
              : draftRequest
                ? draftRequest.json()
                : Promise.resolve(undefined);
        void data
          .then((value: unknown) => {
            if (value && preferences?.listingPrices !== false)
              rememberSubjects(value);
            if (!onBatchPage) return;
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
      const canceled =
        method === "DELETE" && AUCTION_DETAILS_PATH.exec(url.pathname);
      if (
        canceled &&
        url.origin === win.location.origin &&
        preferences?.listingChanges !== false
      ) {
        const auctionId = canceled[1].toLowerCase();
        void response
          .then(async (res) => {
            if (!res.ok) return;
            const confirmedAt = Date.now();
            await Promise.allSettled(decodingSubjects);
            relay({
              type: RELAY_LISTED,
              path: url.pathname,
              canceled: {
                auctionId,
                submittedAt: confirmedAt,
                subjectId: auctionSubjects.get(auctionId),
              },
            });
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
        const sellPage = new URL(win.location.href);
        if (trackPrices && sellPage.pathname === "/market/sell")
          rememberSubjects({
            instanceId: sellPage.searchParams.get("instance"),
            subjectId: sellPage.searchParams.get("subject"),
          });

        const body = !trackPrices
          ? undefined
          : typeof init?.body === "string"
            ? Promise.resolve()
                .then(() => JSON.parse(init.body as string))
                .catch(() => undefined)
            : listingRequest?.json().catch(() => undefined);
        const submission = Promise.resolve(body).then((request) => {
          const submitted = listingSubmission(
            url.pathname,
            request,
            subjects,
            auctionSubjects,
          );
          const matchingForm = submitted.batch
            ? "/market/sell/batch"
            : "/market/sell";
          if (
            trackPrices &&
            win.document &&
            sellPage.pathname === matchingForm &&
            win.location.href === sellPage.href &&
            (submitted.batch
              ? Array.from(submitted.items.values()).some(
                  (item) => !item.subjectId || !item.finish,
                )
              : submitted.single?.copyId &&
                (!submitted.single.subjectId || !submitted.single.finish) &&
                !submitted.single.relistOf)
          ) {
            try {
              const targets = salesTargets(win.document);
              for (const target of targets.values()) {
                const item =
                  submitted.single && targets.size === 1
                    ? submitted.single
                    : target.copyId
                      ? submitted.items.get(target.copyId)
                      : undefined;
                if (item && (!target.copyId || target.copyId === item.copyId) && (!item.subjectId || item.subjectId === target.context.subjectId)) {
                  item.subjectId = target.context.subjectId;
                  item.finish ??= target.context.variant.fullArt ? "fullart" : target.context.variant.veil ? "veil" : "plain";
                }
              }
            } catch {
              // The game may already have replaced the form.
            }
          }
          return submitted;
        });
        void response
          .then(async (res) => {
            if (!res.ok) return;
            const confirmedAt = Date.now();
            const result = await res.clone().json();
            // A native sale may follow a collection read before its cloned body finishes decoding.
            if (trackPrices) await Promise.allSettled(decodingSubjects);
            const listings = listingConfirmations(
              await submission,
              result,
              submittedAt,
              subjects,
              auctionSubjects,
              copyFinishes,
            );
            if (
              listings.length ||
              (url.pathname.endsWith("/batch") && result?.listed > 0)
            )
              relay({
                type: RELAY_LISTED,
                path: url.pathname,
                listings,
                confirmedAt,
              });
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
          auction ||
          (url.pathname === "/api/families"
            ? preferences?.familyMilestones !== false
            : url.pathname === "/api/vortex/lobby"
              ? preferences?.vortex !== false
              : preferences?.fusion !== false);
        if (enabled())
          void response
            .then((res) => {
              if (!res.ok || !enabled()) return;
              const copy = res.clone();
              const forward = () => {
                if (!enabled()) {
                  void copy.body?.cancel().catch(() => {});
                  return;
                }
                void copy
                  .json()
                  .then((data: unknown) => {
                    if (enabled())
                      relay({
                        type: RELAY_DATA,
                        path: url.pathname,
                        data,
                        ...(url.pathname === "/api/fusion/cards" && {
                          fusionQuery: url.search,
                        }),
                      });
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

export function observedCardIds(path: string, data: unknown): string[] {
  const ids = new Set<string>();
  function add(value: unknown) {
    const id =
      typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : value;
    if (validCardId(id) && ids.size < 500) ids.add(id);
  }
  add(CARD_PRICES_PATH.exec(path)?.[1]);
  add(CARD_DETAILS_PATH.exec(path)?.[1]);
  function visit(value: unknown, depth: number, card = false) {
    if (depth > 10 || !value || typeof value !== "object" || ids.size >= 500)
      return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 500)) visit(item, depth + 1, card);
      return;
    }
    const row = value as Record<string, unknown>;
    add(row.subjectId);
    if (card) add(row.id);
    for (const [name, nested] of Object.entries(row))
      visit(
        nested,
        depth + 1,
        name === "card" || (name === "cards" && path === "/api/cards"),
      );
  }
  visit(data, 0, path === "/api/cards");
  return [...ids];
}
