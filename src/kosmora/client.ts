import { ReadCache } from "../shared/cache";
import {
  RequestScheduler,
  requestPriority,
  setRequestPriority,
} from "../shared/request-scheduler";
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
  private reads = new ReadCache(40, 300_000);
  private cardReads = new ReadCache(150, 30_000);
  private priceReads = new ReadCache(450, 300_000);
  private albumReads = new ReadCache(100, 10_000);
  private openingReads = new ReadCache(40, 30_000);
  private accountReads = new ReadCache(1, 2_000);
  private auctionReads = new ReadCache(100, 30_000);
  private scheduler = new RequestScheduler(3);
  private accountVersion = 0;
  private accountListeners = new Set<() => void>();
  private lastAccount?: Account;
  private blockedUntil = 0;
  private writes = new Set<string>();
  constructor(
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}
  onAccountChange(listener: () => void) {
    this.accountListeners.add(listener);
  }
  private clearPrivateReads() {
    this.accountVersion++;
    for (const cache of [
      this.reads,
      this.cardReads,
      this.priceReads,
      this.albumReads,
      this.openingReads,
      this.auctionReads,
    ])
      cache.clear();
  }
  private cached<T>(
    cache: ReadCache,
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    fresh = false,
    paths: string[] = [],
  ) {
    const scopedKey = `${this.lastAccount?.key}:${key}`;
    if (requestPriority(signal) === "foreground") {
      const pending = cache.pendingSignal(scopedKey);
      if (pending) setRequestPriority(pending, "foreground");
      for (const path of paths) this.scheduler.promote(path);
    }
    const version = this.accountVersion;
    return cache.get(
      scopedKey,
      async (shared) => {
        setRequestPriority(shared, requestPriority(signal));
        const result = await load(shared);
        if (version !== this.accountVersion)
          throw new DOMException(
            "Your Kosmora account changed. Reopen the popup.",
            "AbortError",
          );
        return result;
      },
      fresh,
      signal,
    );
  }
  private async read(path: string, signal?: AbortSignal) {
    const shared = signal ?? new AbortController().signal;
    return this.scheduler.run(path, shared, () =>
      this.send(path, "GET", undefined, shared),
    );
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
        const hadAccount = !!this.lastAccount;
        this.lastAccount = undefined;
        this.accountReads.clear();
        this.clearPrivateReads();
        if (hadAccount)
          for (const listener of this.accountListeners) listener();
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
  async account(signal?: AbortSignal, fresh = true): Promise<Account> {
    if (requestPriority(signal) === "foreground") {
      const pending = this.accountReads.pendingSignal("account");
      if (pending) setRequestPriority(pending, "foreground");
      this.scheduler.promote("/me");
    }
    return this.accountReads.get(
      "account",
      async (shared) => {
        setRequestPriority(shared, requestPriority(signal));
        const version = this.accountVersion;
        const next = parseAccount(await this.read("/me", shared));
        if (version !== this.accountVersion)
          throw new DOMException(
            "The account session changed while it was loading.",
            "AbortError",
          );
        const changed = !!this.lastAccount && next.key !== this.lastAccount.key;
        if (next.key !== this.lastAccount?.key) this.clearPrivateReads();
        this.lastAccount = next;
        if (changed) for (const listener of this.accountListeners) listener();
        return next;
      },
      fresh && !this.accountReads.hasPending("account"),
      signal,
    );
  }
  insights(id: string, signal?: AbortSignal, fresh = false) {
    id = subjectId(id);
    const path = `/collection/${id}`;
    return this.cached(
      this.cardReads,
      `card:${id}`,
      async (shared) => parseInsights(await this.read(path, shared)),
      signal,
      fresh,
      [path],
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
    if (requestPriority(signal) === "foreground")
      this.scheduler.promotePrefix(
        `/auctions?${new URLSearchParams({ q: name, sort: "ending" })}&`,
      );
    return this.cached(
      this.auctionReads,
      `auctions:${id}:${name}`,
      (shared) => {
        const timeout = AbortSignal.timeout(15_000);
        const combined = AbortSignal.any([shared, timeout]);
        setRequestPriority(combined, requestPriority(shared));
        return activeAuctionSummary(id, name, (path) => {
          setRequestPriority(combined, requestPriority(shared));
          return this.read(path, combined);
        });
      },
      signal,
      fresh,
    );
  }
  families(signal?: AbortSignal, fresh = false) {
    return this.cached(
      this.reads,
      "family-choices",
      async (shared) =>
        parseFamilyChoices(await this.read("/atlas/families", shared)),
      signal,
      fresh,
      ["/atlas/families"],
    );
  }
  friends(signal?: AbortSignal, fresh = false) {
    return this.cached(
      this.reads,
      "friends",
      async (shared) => parseFriends(await this.read("/friends", shared)),
      signal,
      fresh,
      ["/friends"],
    );
  }
  questSubjects(signal?: AbortSignal, fresh = false) {
    return this.cached(
      this.reads,
      "quest-subjects",
      async (shared) => parseQuestSubjects(await this.read("/quests", shared)),
      signal,
      fresh,
      ["/quests"],
    );
  }
  history(id: string, finish: Finish, signal?: AbortSignal, fresh = false) {
    id = subjectId(id);
    const path = `/cards/${id}/prices?finish=${finish}`;
    return this.cached(
      this.priceReads,
      `prices:${id}:${finish}`,
      async (shared) => parseHistory(await this.read(path, shared), finish),
      signal,
      fresh,
      [path],
    );
  }
  async albums(
    id?: string,
    signal?: AbortSignal,
    fresh = false,
  ): Promise<Album[]> {
    const path = `/albums${id ? `?contains=${subjectId(id)}` : ""}`;
    return this.cached(
      this.albumReads,
      path,
      async (shared) => parseAlbums(await this.read(path, shared)),
      signal,
      fresh,
      [path],
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
        this.cached(
          this.openingReads,
          `opening:${uuid(id)}`,
          async (shared) =>
            parseOpening(await this.read(`/openings/${id}`, shared)),
          signal,
          false,
          [`/openings/${id}`],
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
      const album = (await this.albums(id, undefined, true)).find(
        (a) => a.id === albumId,
      );
      if (!album) throw new Error("This album is no longer available.");
      if (album.contains === undefined)
        throw new Error("Album membership could not be verified.");
      if (!album.contains) return;
      try {
        await this.send(`/albums/${albumId}/items/${id}`, "DELETE");
      } catch (error) {
        // A failed response can follow a committed removal. Confirm it without
        // repeating the mutation or turning it into an add/remove toggle.
        const refreshed = await this.albums(id, undefined, true).catch(
          () => null,
        );
        if (refreshed?.find((a) => a.id === albumId)?.contains !== false)
          throw error;
      }
      this.albumReads.clear();
      if (
        (await this.albums(id, undefined, true)).find((a) => a.id === albumId)
          ?.contains !== false
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
      const album = (await this.albums(copy.subjectId, undefined, true)).find(
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
        const refreshed = await this.albums(
          copy.subjectId,
          undefined,
          true,
        ).catch(() => null);
        if (!refreshed?.find((a) => a.id === albumId)?.contains) throw error;
      }
      this.albumReads.clear();
      if (
        !(await this.albums(copy.subjectId, undefined, true)).find(
          (a) => a.id === albumId,
        )?.contains
      )
        throw new Error(
          "The update could not be confirmed. Refresh membership before trying again.",
        );
    } finally {
      this.writes.delete(key);
    }
  }
}
