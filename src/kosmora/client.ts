import { ReadCache } from "../shared/cache";
import { parseFamilyChoices } from "./families";
import { parseFriends } from "./friends";
import { parseQuestSubjects } from "./quests";
import { activeAuctionSummary } from "./auctions";
import type {
  Account,
  Album,
  CardContext,
  KosmoraClient,
  OpeningCard,
  OwnedCopy,
  Finish,
} from "../shared/types";
import {
  object,
  parseAccount,
  parseAlbums,
  parseHistory,
  parseInsights,
  parseOpening,
  subjectId,
  uuid,
} from "./contracts";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public retryAt = 0,
  ) {
    super(message);
  }
}
export class GameClient implements KosmoraClient {
  private reads = new ReadCache();
  private auctionReads = new ReadCache(100, 30_000);
  private lastAccount?: Account;
  private blockedUntil = 0;
  private writes = new Set<string>();
  constructor(
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}
  private async read(path: string, signal?: AbortSignal) {
    return this.send(path, "GET", undefined, signal);
  }
  private async send(
    path: string,
    method: "GET" | "POST" | "DELETE",
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (Date.now() < this.blockedUntil)
      throw new ApiError(
        "Kosmora is rate limiting requests. Try again shortly.",
        429,
        this.blockedUntil,
      );
    const timeout = AbortSignal.timeout(15_000),
      combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const r = await this.fetcher(`/api${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: combined,
      headers:
        method !== "GET"
          ? {
              Accept: "application/json",
              "Content-Type": "application/json",
              "x-kosmora": "1",
            }
          : { Accept: "application/json" },
      // The native transport sends valid JSON for every write, including DELETE.
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    const data: unknown = await r.json().catch(() => null);
    if (r.status === 429) {
      const retry = Number(r.headers.get("Retry-After"));
      this.blockedUntil =
        Date.now() +
        (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 300) : 30) *
          1000;
    }
    if (!r.ok) {
      if (r.status === 401) {
        this.lastAccount = undefined;
        this.reads.clear();
        this.auctionReads.clear();
      }
      throw new ApiError(
        r.status === 401
          ? "Sign in to Kosmora to continue."
          : r.status === 429
            ? "Kosmora is rate limiting requests. Try again shortly."
            : r.status === 404
              ? "This card or album is no longer available."
              : `Kosmora could not complete the request (${r.status}).`,
        r.status,
        r.status === 429 ? this.blockedUntil : 0,
      );
    }
    return data;
  }
  async account(signal?: AbortSignal, _fresh = false): Promise<Account> {
    const next = parseAccount(await this.read("/me", signal));
    if (next.key !== this.lastAccount?.key) {
      this.reads.clear();
      this.auctionReads.clear();
    }
    this.lastAccount = next;
    return next;
  }
  insights(id: string, signal?: AbortSignal, fresh = false) {
    id = subjectId(id);
    return this.reads.get(
      `${this.lastAccount?.key}:card:${id}`,
      async () => parseInsights(await this.read(`/collection/${id}`, signal)),
      fresh,
    );
  }
  async activeAuctions(
    id: string,
    name: string,
    signal?: AbortSignal,
    fresh = false,
  ) {
    return (await this.auctionSummary(id, name, signal, fresh)).count;
  }
  async lowestListingPrice(
    id: string,
    name: string,
    signal?: AbortSignal,
    fresh = false,
  ) {
    return (await this.auctionSummary(id, name, signal, fresh)).lowestPrice;
  }
  private auctionSummary(
    id: string,
    name: string,
    signal?: AbortSignal,
    fresh = false,
  ) {
    id = subjectId(id);
    return this.auctionReads.get(
      `${this.lastAccount?.key}:auctions:${id}:${name}`,
      () => {
        const timeout = AbortSignal.timeout(15_000);
        const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
        return activeAuctionSummary(id, name, (path) =>
          this.read(path, combined),
        );
      },
      fresh,
    );
  }
  families(signal?: AbortSignal, fresh = false) {
    return this.reads.get(
      `${this.lastAccount?.key}:family-choices`,
      async () =>
        parseFamilyChoices(await this.read("/atlas/families", signal)),
      fresh,
    );
  }
  friends(signal?: AbortSignal, fresh = false) {
    return this.reads.get(
      `${this.lastAccount?.key}:friends`,
      async () => parseFriends(await this.read("/friends", signal)),
      fresh,
    );
  }
  questSubjects(signal?: AbortSignal, fresh = false) {
    return this.reads.get(
      `${this.lastAccount?.key}:quest-subjects`,
      async () => parseQuestSubjects(await this.read("/quests", signal)),
      fresh,
    );
  }
  history(id: string, finish: Finish, signal?: AbortSignal, fresh = false) {
    id = subjectId(id);
    return this.reads.get(
      `${this.lastAccount?.key}:prices:${id}:${finish}`,
      async () =>
        parseHistory(
          await this.read(`/cards/${id}/prices?finish=${finish}`, signal),
          finish,
        ),
      fresh,
    );
  }
  async albums(id?: string, signal?: AbortSignal): Promise<Album[]> {
    return parseAlbums(
      await this.read(
        `/albums${id ? `?contains=${subjectId(id)}` : ""}`,
        signal,
      ),
    );
  }
  async resolveCopy(
    context: CardContext,
    copies: OwnedCopy[],
    signal?: AbortSignal,
  ): Promise<OwnedCopy | undefined> {
    if (context.copyId) return copies.find((c) => c.id === context.copyId);
    if (context.surface === "page") return undefined;
    const ids = context.openingIds.length
      ? context.openingIds
      : this.lastAccount?.currentOpeningId
        ? [this.lastAccount.currentOpeningId]
        : [];
    const batches = await Promise.all(
      ids.map((id) =>
        this.reads.get(
          `${this.lastAccount?.key}:opening:${uuid(id)}`,
          async () => parseOpening(await this.read(`/openings/${id}`, signal)),
        ),
      ),
    );
    const entries = batches.flat();
    if (!entries.length) return undefined;
    let ordered: OpeningCard[];
    if (context.surface === "reveal") {
      const ranks = [
        "Common",
        "Uncommon",
        "Rare",
        "Epic",
        "Legendary",
        "Mythic",
      ];
      ordered = [...entries].sort(
        (a, b) =>
          (a.variant.fullArt ? 2 : +a.variant.veil) -
            (b.variant.fullArt ? 2 : +b.variant.veil) ||
          ranks.indexOf(a.rarity) - ranks.indexOf(b.rarity) ||
          a.slot - b.slot,
      );
    } else
      ordered = batches.flatMap((cards) =>
        [...cards].sort((a, b) => a.slot - b.slot),
      );
    // Slot order is established from the delivered recap/reveal code, then independently checked against subject AND finish.
    const entry =
      context.entryIndex === undefined
        ? undefined
        : ordered[context.entryIndex];
    const matches = (c: OpeningCard) =>
      c.subjectId === context.subjectId &&
      c.variant.veil === context.variant.veil &&
      c.variant.fullArt === context.variant.fullArt;
    const candidates =
      entry && matches(entry) ? [entry] : entries.filter(matches);
    if (candidates.length !== 1) return undefined;
    return copies.find((c) => c.id === candidates[0].instanceId);
  }
  async remove(
    albumId: string,
    id: string,
    expectedAccount: string,
  ): Promise<void> {
    uuid(albumId);
    id = subjectId(id);
    const key = `${albumId}:${id}`;
    if (this.writes.has(key))
      throw new Error("An album update is already in progress.");
    this.writes.add(key);
    try {
      if ((await this.account()).key !== expectedAccount)
        throw new Error("Your Kosmora account changed. Reopen the tooltip.");
      const album = (await this.albums(id)).find((a) => a.id === albumId);
      if (!album) throw new Error("This album is no longer available.");
      if (album.contains === undefined)
        throw new Error("Album membership could not be verified.");
      if (!album.contains) return;
      try {
        await this.send(`/albums/${albumId}/items/${id}`, "DELETE");
      } catch (error) {
        // A failed response can follow a committed removal. Confirm it without
        // repeating the mutation or turning it into an add/remove toggle.
        const refreshed = await this.albums(id).catch(() => null);
        if (refreshed?.find((a) => a.id === albumId)?.contains !== false)
          throw error;
      }
      this.reads.clear();
      if (
        (await this.albums(id)).find((a) => a.id === albumId)?.contains !==
        false
      )
        throw new Error(
          "The removal could not be confirmed. Refresh membership before trying again.",
        );
    } finally {
      this.writes.delete(key);
    }
  }
  async add(
    albumId: string,
    copy: OwnedCopy,
    expectedAccount: string,
  ): Promise<void> {
    uuid(albumId);
    uuid(copy.id);
    subjectId(copy.subjectId);
    const key = `${albumId}:${copy.subjectId}`;
    if (this.writes.has(key))
      throw new Error("An album update is already in progress.");
    this.writes.add(key);
    try {
      if ((await this.account()).key !== expectedAccount)
        throw new Error("Your Kosmora account changed. Reopen the popup.");
      const current = await this.insights(copy.subjectId, undefined, true);
      if (!current.copies.some((c) => c.id === copy.id))
        throw new Error("You no longer own this copy.");
      const album = (await this.albums(copy.subjectId)).find(
        (a) => a.id === albumId,
      );
      if (!album) throw new Error("This album is no longer available.");
      if (album.contains) return;
      if (album.contains === undefined)
        throw new Error("Album membership could not be verified.");
      if (album.items >= 2000)
        throw new Error("This album is full (2,000 cards).");
      try {
        object(
          await this.send(`/albums/${albumId}/items`, "POST", {
            subjectIds: [copy.subjectId],
            copyId: copy.id,
          }),
        );
      } catch (error) {
        // A timeout can occur after the server committed. Reconcile, but never repeat the POST.
        const refreshed = await this.albums(copy.subjectId).catch(() => null);
        if (!refreshed?.find((a) => a.id === albumId)?.contains) throw error;
      }
      this.reads.clear();
      if (
        !(await this.albums(copy.subjectId)).find((a) => a.id === albumId)
          ?.contains
      )
        throw new Error(
          "The update could not be confirmed. Refresh membership before trying again.",
        );
    } finally {
      this.writes.delete(key);
    }
  }
}
