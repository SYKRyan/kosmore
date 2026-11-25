import { ListingHistorySync } from "./listing-history-sync";
import {
  ServicesCardStore,
  type CachedCard,
  type CachedListings,
} from "./services-card-store";
import {
  parseServicesCard,
  parseServicesListings,
  servicesBase,
  servicesPermission,
  SERVICES_STATE_KEY,
  validCardId,
  type CardView,
  type ConnectionStatus,
} from "./shared/services";
import { object } from "./kosmora/contracts";
import { messageOf } from "./shared/types";

const DAY = 86_400_000;
const BATCH_SIZE = 100;
const DEFERRED_CARD_KEY = "kosmore.deferredCard";
const PENDING_LINK_KEY = "kosmore.pendingAccountLink";
const CALLBACK_RULE_ID = 1;

interface PendingLink {
  target: string;
  state: string;
  verifier: string;
  authorizationUrl: string;
  expiresAt: number;
  inviteHash?: string;
}

interface Session {
  token: string;
  handle?: string;
  playerId: string;
  expiresAt: number;
  blocked?: boolean;
  scopes?: string[];
}

interface Job {
  promise: Promise<void>;
  resolve(): void;
  privateDemand: boolean;
  batchCandidates?: string[];
}

export function installServicesBackground() {
  const store = new ServicesCardStore();
  let base = "";
  let session: Session | undefined;
  let generation = new AbortController();
  let lastPrune = 0;
  const jobs = new Map<string, Job>();
  let flushing = false;
  let linking: AbortController | undefined;
  let pendingLink: PendingLink | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryAt = 0;
  const retryCards = new Map<string, number>();
  let listingLoad: Promise<void> | undefined;
  let listingRetryAt = 0;
  const passive = new Set<string>();
  let deferred: string | undefined;
  const ready = store.connection().then(async (connection) => {
    base = connection?.base ?? "";
    session = connection?.session;
    pendingLink = (await chrome.storage.session?.get(PENDING_LINK_KEY))?.[
      PENDING_LINK_KEY
    ] as PendingLink | undefined;
    const saved = (await chrome.storage?.session?.get(DEFERRED_CARD_KEY))?.[
      DEFERRED_CARD_KEY
    ] as { base?: string; player?: string; id?: unknown } | undefined;
    if (
      saved?.base === base &&
      saved?.player === session?.playerId &&
      validCardId(saved?.id)
    )
      deferred = saved.id;
  });
  let connectionWrites: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>) => {
    const result = connectionWrites.then(operation);
    connectionWrites = result.catch(() => {});
    return result;
  };
  const policy = fetch(chrome.runtime.getURL("card-cache-config.json")).then(
    async (response) => {
      const data = object(await response.json());
      const days = data.retentionDays,
        seconds = data.freshnessSeconds;
      if (
        typeof days !== "number" ||
        !Number.isInteger(days) ||
        days < 1 ||
        typeof seconds !== "number" ||
        !Number.isInteger(seconds) ||
        seconds < 1 ||
        seconds > days * 86_400
      )
        throw new Error("Invalid card cache configuration.");
      return { retention: days * DAY, freshness: seconds * 1000 };
    },
  );
  void policy.catch(() => {});
  void ready.catch(() => {});

  const history = new ListingHistorySync(async () => {
    await ready;
    const linked = session,
      url = base,
      signal = generation.signal;
    if (
      !linked?.handle ||
      linked.blocked ||
      linked.expiresAt <= Date.now() ||
      (linked.scopes && !linked.scopes.includes("listings"))
    )
      return;
    return {
      scope: JSON.stringify([url, linked.playerId]),
      handle: linked.handle.toLowerCase(),
      signal,
      async request(path, method = "GET", body) {
        const response = await call(
          url,
          path,
          signal,
          linked.token,
          body,
          method,
        );
        if (
          response.status === 403 &&
          (
            await response
              .clone()
              .json()
              .catch(() => ({}))
          )?.error === "scope_missing"
        )
          await serialize(async () => {
            if (!signal.aborted && session === linked)
              await replace(url, {
                ...linked,
                scopes: (linked.scopes ?? ["identity"]).filter(
                  (s) => s !== "listings",
                ),
              });
          });
        else await accessDenied(response, url, linked, signal);
        return response;
      },
    };
  });
  history.install();

  const status = (): ConnectionStatus => ({
    base,
    ...(session && {
      playerId: session.playerId,
      handle: session.handle ?? "Linked Kosmora account",
      expiresAt: session.expiresAt,
      blocked: session.blocked,
    }),
  });

  async function persistDeferred(id?: string) {
    deferred = id;
    if (id)
      await chrome.storage?.session
        ?.set({ [DEFERRED_CARD_KEY]: { id, base, player: session?.playerId } })
        .catch(() => {});
    else
      await chrome.storage?.session?.remove(DEFERRED_CARD_KEY).catch(() => {});
  }

  async function replace(nextBase: string, nextSession?: Session) {
    await clearPendingLink();
    generation.abort();
    generation = new AbortController();
    for (const job of jobs.values()) job.resolve();
    jobs.clear();
    passive.clear();
    listingLoad = undefined;
    listingRetryAt = 0;
    retryAt = 0;
    retryCards.clear();
    base = nextBase;
    session = nextSession;
    await persistDeferred();
    await store.saveConnection({ base, session });
    await chrome.storage.local.set({
      [SERVICES_STATE_KEY]: crypto.randomUUID(),
    });
  }

  async function call(
    url: string,
    route: string,
    signal: AbortSignal,
    token?: string,
    data?: unknown,
    method = data === undefined ? "GET" : "POST",
  ) {
    return fetch(url + route, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(data !== undefined && { "Content-Type": "application/json" }),
      },
      ...(data !== undefined && { body: JSON.stringify(data) }),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
  }

  const base64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

  async function clearPendingLink() {
    if (!pendingLink) return;
    await chrome.storage.session.remove(PENDING_LINK_KEY);
    pendingLink = undefined;
    await chrome.declarativeNetRequest?.updateSessionRules({
      removeRuleIds: [CALLBACK_RULE_ID],
    });
  }

  async function savePendingLink(link: PendingLink) {
    await chrome.storage.session.set({ [PENDING_LINK_KEY]: link });
    pendingLink = link;
  }

  async function startLink(
    target: string,
    inviteCode: string | undefined,
    signal: AbortSignal,
  ) {
    const verifier = random(),
      state = random();
    const digest = async (value: string) =>
      base64url(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(value),
          ),
        ),
      );
    const inviteHash = inviteCode ? await digest(inviteCode) : undefined;
    const existing = pendingLink;
    if (
      existing &&
      existing.target === target &&
      existing.expiresAt > Date.now() &&
      (!inviteCode || existing.inviteHash === inviteHash)
    )
      return existing;
    await clearPendingLink();
    const expiresAt = Date.now() + 10 * 60_000;
    const redirectUri = chrome.identity.getRedirectURL("kosmore-services");
    const handoffChallenge = await digest(verifier);
    const start = await call(target, "/v1/connect/start", signal, undefined, {
      redirectUri,
      handoffChallenge,
      state,
      ...(inviteCode && { inviteCode }),
    });
    if (!start.ok) {
      if (
        object(await start.json().catch(() => ({}))).error ===
        "invite_unavailable"
      )
        throw new Error(
          "This invite is unavailable. Ask the administrator for a new code.",
        );
      throw new Error(
        `Services could not start account linking (HTTP ${start.status}).`,
      );
    }
    const authorization = new URL(
      object(await start.json()).authorizationUrl as string,
    );
    if (
      authorization.origin !== "https://kosmora.io" ||
      authorization.username ||
      authorization.password
    )
      throw new Error(
        "Services returned an unexpected Kosmora authorization URL.",
      );
    return {
      target,
      verifier,
      state,
      authorizationUrl: authorization.href,
      expiresAt,
      inviteHash,
    };
  }

  async function connect(rawBase: string, inviteCode?: string, copy = false) {
    const target = servicesBase(rawBase);
    if (copy && !chrome.declarativeNetRequest?.updateSessionRules)
      throw new Error(
        "This browser cannot receive a sign-in link in another tab.",
      );
    if (
      !(await chrome.permissions.contains({
        origins: [servicesPermission(target)],
      }))
    )
      throw new Error("Allow access to the Services host before connecting.");
    linking?.abort();
    const attempt = new AbortController();
    linking = attempt;
    const link = await serialize(async () => {
      attempt.signal.throwIfAborted();
      if (base !== target) await replace(target);
      const signal = AbortSignal.any([attempt.signal, generation.signal]);
      const flow = await startLink(target, inviteCode?.trim(), signal);
      signal.throwIfAborted();
      if (copy) {
        // Route only the top-level callback for this pending sign-in.
        const callbackHost = chrome.runtime.id + "\\.chromiumapp\\.org";
        await savePendingLink(flow);
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: [CALLBACK_RULE_ID],
          addRules: [
            {
              id: CALLBACK_RULE_ID,
              action: {
                type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
                redirect: {
                  regexSubstitution:
                    chrome.runtime.getURL("link-complete.html") + "#\\1",
                },
              },
              condition: {
                regexFilter: `^https://${callbackHost}/kosmore-services\\?((code|error)=[A-Za-z0-9_-]+&state=${flow.state})$`,
                isUrlFilterCaseSensitive: true,
                resourceTypes: [
                  chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
                ],
              },
            },
          ],
        });
      } else {
        await clearPendingLink();
      }
      return flow;
    });
    if (copy) return { url: link.authorizationUrl };
    const signal = AbortSignal.any([attempt.signal, generation.signal]);
    signal.throwIfAborted();
    let redirect: string | undefined;
    try {
      redirect = await chrome.identity.launchWebAuthFlow({
        url: link.authorizationUrl,
        interactive: true,
      });
    } catch (error) {
      if (/couldn.t create a browser window/i.test(messageOf(error))) {
        await serialize(async () => {
          signal.throwIfAborted();
          await savePendingLink(link);
        });
        throw new Error(
          "The browser could not open the sign-in window. Choose Copy Link to continue in another tab.",
        );
      }
      throw error;
    }
    if (!redirect) throw new Error("Kosmora did not complete account linking.");
    return finishLink(link, redirect, signal);
  }

  async function finishCopiedLink(query: string) {
    const { link, signal } = await serialize(async () => {
      const link = pendingLink;
      if (!link || link.target !== base || link.expiresAt <= Date.now())
        throw new Error(
          "This link has expired or has already been used. Return to KosMore Settings.",
        );
      const states = new URLSearchParams(query).getAll("state");
      if (states.length !== 1 || states[0] !== link.state)
        throw new Error(
          "This callback does not match the link from KosMore Settings.",
        );
      await clearPendingLink();
      const attempt = (linking ??= new AbortController());
      return {
        link,
        signal: AbortSignal.any([attempt.signal, generation.signal]),
      };
    });
    return finishLink(
      link,
      chrome.identity.getRedirectURL("kosmore-services") + "?" + query,
      signal,
    );
  }

  async function finishLink(
    link: PendingLink,
    redirect: string,
    signal: AbortSignal,
  ) {
    const { target, verifier, state } = link;
    const redirectUri = chrome.identity.getRedirectURL("kosmore-services");
    const callback = new URL(redirect);
    const code = callback.searchParams.get("code");
    if (
      callback.origin + callback.pathname !== redirectUri ||
      callback.hash ||
      callback.searchParams.getAll("state").length !== 1 ||
      callback.searchParams.get("state") !== state
    )
      throw new Error("Kosmora returned an invalid account-linking callback.");
    const callbackError = callback.searchParams.get("error");
    if (callbackError === "whitelist_required")
      throw new Error(
        "Approval required. Enter a tester invite or ask the administrator for access.",
      );
    if (callbackError === "invite_unavailable")
      throw new Error(
        "This invite is unavailable. Ask the administrator for a new code.",
      );
    if (
      !code ||
      callback.searchParams.has("error") ||
      callback.searchParams.getAll("code").length !== 1
    )
      throw new Error("Kosmora account linking was declined or failed.");
    const exchange = await call(
      target,
      "/v1/connect/exchange",
      signal,
      undefined,
      { code, handoffVerifier: verifier },
    );
    if (!exchange.ok)
      throw new Error(
        `Services could not complete account linking (HTTP ${exchange.status}).`,
      );
    const credentials = object(await exchange.json());
    const token = credentials.accessToken;
    const expiresAt = Date.parse(String(credentials.expiresAtUtc));
    if (
      typeof token !== "string" ||
      !token ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    )
      throw new Error("Services returned an invalid session.");
    const me = await call(target, "/v1/me", signal, token);
    if (!me.ok)
      throw new Error(
        `Services could not verify the linked account (HTTP ${me.status}).`,
      );
    const profile = object(await me.json());
    if (typeof profile.id !== "string" || !/^[a-f0-9]{24}$/.test(profile.id))
      throw new Error("Services returned an invalid player identity.");
    signal.throwIfAborted();
    const playerId = profile.id;
    return serialize(async () => {
      signal.throwIfAborted();
      await replace(target, {
        token,
        expiresAt,
        scopes: Array.isArray(credentials.scopes)
          ? credentials.scopes
          : undefined,
        playerId,
        handle: typeof profile.handle === "string" ? profile.handle : undefined,
      });
      history.schedule();
      return status();
    });
  }

  const key = (url: string, id: string) => JSON.stringify([url, id]);
  const privateKey = (url: string, player: string, id: string) =>
    JSON.stringify([url, player, id]);

  async function snapshot(id: string, account?: string): Promise<CardView> {
    const current = session,
      url = base,
      signal = generation.signal;
    const { retention, freshness } = await policy;
    const record = await store.get("cards", key(url, id));
    const privateRows =
      account &&
      current &&
      !current.blocked &&
      current.handle?.toLowerCase() === account &&
      current.expiresAt > Date.now()
        ? await Promise.all(
            ["all", id].map((resource) =>
              store.get(
                "listings",
                privateKey(url, current.playerId, resource),
              ),
            ),
          )
        : [];
    const mine = privateRows
      .filter(
        (row): row is CachedListings =>
          !!row && (row.freshUntil ?? 0) > Date.now(),
      )
      .sort(
        (a, b) => (b.startedAt ?? b.fetchedAt) - (a.startedAt ?? a.fetchedAt),
      )[0];
    signal.throwIfAborted();
    const now = Date.now();
    const until = record
      ? Math.min(record.fetchedAt + freshness, record.freshUntil)
      : 0;
    const listings = mine?.listings.filter(
      (entry) => entry.subjectId === id && Date.parse(entry.endsAt) > now,
    );
    if (
      !record ||
      record.fetchedAt <= now - retention ||
      (record.missing && until <= now)
    )
      return {
        stale: true,
        until: 0,
        listings,
        listingsAsOf: mine?.startedAt ?? mine?.fetchedAt,
        listingsUntil: mine?.freshUntil,
        accessBlocked: current?.blocked,
      };
    return {
      accessBlocked: current?.blocked,
      fetchedAt: record.fetchedAt,
      card: record.card,
      missing: record.missing,
      stale: until <= now,
      until,
      listings,
      listingsAsOf: mine?.startedAt ?? mine?.fetchedAt,
      listingsUntil: mine?.freshUntil,
    };
  }

  function retryDelay(header: string | null, hint?: unknown) {
    const delay =
      header && /^\d+$/.test(header)
        ? Number(header) * 1000
        : header
          ? Date.parse(header) - Date.now()
          : typeof hint === "number" && Number.isFinite(hint)
            ? hint * 1000
            : 15_000;
    return Math.max(1000, Number.isFinite(delay) ? delay : 15_000);
  }

  async function notify(ids: string[], firstFetchedAt: Record<string, number>) {
    const tabs = await chrome.tabs.query({ url: "https://kosmora.io/*" });
    for (let start = 0; start < ids.length; start += 100) {
      const message = { op: "servicesCardsChanged", ids: ids.slice(start, start + 100), firstFetchedAt };
      await Promise.allSettled(tabs.flatMap(tab => tab.id === undefined
        ? [] : [chrome.tabs.sendMessage(tab.id, message, { frameId: 0 })]));
    }
  }

  async function accessDenied(
    response: Response,
    url: string,
    linked: Session,
    signal: AbortSignal,
  ) {
    if (response.status !== 401 && response.status !== 403) return false;
    await serialize(async () => {
      if (!signal.aborted && session === linked) {
        await replace(
          url,
          response.status === 403 ? { ...linked, blocked: true } : undefined,
        );
      }
    });
    return true;
  }

  async function privateListings(account: string | undefined) {
    const linked = session,
      url = base,
      signal = generation.signal;
    if (
      !linked ||
      !account ||
      linked.handle?.toLowerCase() !== account ||
      linked.blocked ||
      linked.expiresAt <= Date.now() ||
      (linked.scopes && !linked.scopes.includes("listings"))
    )
      return;
    const cacheKey = privateKey(url, linked.playerId, "all");
    const cached = await store.get("listings", cacheKey);
    signal.throwIfAborted();
    if (
      (cached?.freshUntil ?? 0) > Date.now() ||
      Math.max(listingRetryAt, retryAt) > Date.now()
    )
      return;
    if (listingLoad) return listingLoad;
    const pending = (async () => {
      const startedAt = Date.now();
      const response = await call(url, "/v1/me/listings", signal, linked.token);
      if (
        response.status === 403 &&
        (
          await response
            .clone()
            .json()
            .catch(() => ({}))
        )?.error === "scope_missing"
      ) {
        await serialize(async () => {
          if (!signal.aborted && session === linked)
            await replace(url, {
              ...linked,
              scopes: (linked.scopes ?? ["identity"]).filter(
                (scope) => scope !== "listings",
              ),
            });
        });
        return;
      }
      if (await accessDenied(response, url, linked, signal)) return;
      if (!response.ok) {
        listingRetryAt =
          Date.now() + retryDelay(response.headers.get("Retry-After"));
        if (response.status === 429) retryAt = listingRetryAt;
        return;
      }
      const rows = object(await response.json()).auctions;
      if (!Array.isArray(rows)) throw new Error("Invalid listing snapshot.");
      const listings = rows.flatMap((raw) => {
        const id = object(object(raw).card).id;
        if (!validCardId(id)) throw new Error("Invalid listing card.");
        return parseServicesListings([raw], id).map((row) => ({
          ...row,
          subjectId: id,
        }));
      });
      const now = Date.now();
      const expiry = Date.parse(
        response.headers.get("X-KosMore-Fresh-Until") ?? "",
      );
      await store.save(
        [],
        [
          {
            key: cacheKey,
            startedAt,
            fetchedAt: now,
            freshUntil: Number.isFinite(expiry) ? expiry : now + 60_000,
            listings,
          },
        ],
        signal,
      );
      const affected = new Set([...(cached?.listings ?? []), ...listings].flatMap(row => row.subjectId ? [row.subjectId] : []));
      if (affected.size) void notify([...affected], {}).catch(() => {});
    })()
      .catch((error) => {
        if (!signal.aborted) listingRetryAt = Date.now() + 15_000;
        throw error;
      })
      .finally(() => {
        if (listingLoad === pending) listingLoad = undefined;
      });
    listingLoad = pending;
    return pending;
  }

  async function refresh(
    ids: string[],
    url: string,
    linked: Session,
    signal: AbortSignal,
    includeMyListings: boolean,
  ) {
    const startedAt = Date.now();
    const response = await call(
      url,
      "/v1/cards/details",
      signal,
      linked.token,
      {
        ids,
        includeMyListings,
        ...(includeMyListings && { preferScopedBatch: true }),
      },
    );
    if (await accessDenied(response, url, linked, signal)) return;
    if (!response.ok) {
      retryAt = Date.now() + retryDelay(response.headers.get("Retry-After"));
      return;
    }
    const data = object(await response.json());
    if (includeMyListings && data.myListingsStatus === "scope-missing")
      listingRetryAt = linked.expiresAt;
    if (!Array.isArray(data.cards)) throw new Error("Invalid Services batch.");
    signal.throwIfAborted();
    const wanted = new Set(ids);
    const changed: string[] = [];
    const firstFetchedAt: Record<string, number> = {};
    const cards: CachedCard[] = [];
    const privateRows: CachedListings[] = [];
    const privateIds = new Set<string>();
    const now = Date.now();
    const retry =
      now +
      retryDelay(response.headers.get("Retry-After"), data.retryAfterSeconds);
    for (const raw of data.cards) {
      try {
        const row = object(raw);
        const id = row.id;
        if (!validCardId(id) || !wanted.delete(id)) continue;
        if (
          includeMyListings &&
          data.myListingsStatus === "fresh" &&
          Array.isArray(row.myListings)
        ) {
          const until = Date.parse(String(data.myListingsFreshUntilUtc));
          privateIds.add(id);
          privateRows.push({
            key: privateKey(url, linked.playerId, id),
            startedAt,
            fetchedAt: now,
            freshUntil: Number.isFinite(until) ? until : now + 60_000,
            listings: parseServicesListings(row.myListings, id).map((item) => ({
              ...item,
              subjectId: id,
            })),
          });
        }
        if (includeMyListings && data.myListingsStatus === "unavailable")
          listingRetryAt = Math.max(listingRetryAt, retry);
        if (
          row.status !== "fresh" &&
          row.status !== "stale" &&
          row.status !== "notFound"
        ) {
          retryCards.set(id, retry);
          continue;
        }
        const fetchedAt = Date.parse(String(row.fetchedAtUtc));
        const freshUntil = Date.parse(String(row.freshUntilUtc));
        if (
          !Number.isFinite(fetchedAt) ||
          !Number.isFinite(freshUntil) ||
          freshUntil < fetchedAt
        )
          throw new Error("Invalid Services cache timestamps.");
        if (row.status === "stale") retryCards.set(id, retry);
        const cardKey = key(url, id);
        const old = await store.get("cards", cardKey);
        if (
          old &&
          (old.fetchedAt > fetchedAt ||
            (old.fetchedAt === fetchedAt && old.freshUntil >= freshUntil))
        )
          continue;
        const record =
          row.status === "notFound"
            ? { key: cardKey, fetchedAt, freshUntil, missing: true }
            : {
                key: cardKey,
                fetchedAt,
                freshUntil:
                  row.status === "stale"
                    ? Math.min(freshUntil, now)
                    : freshUntil,
                card: parseServicesCard(row.details, id),
              };
        cards.push(record);
        changed.push(id);
        if (!old) firstFetchedAt[id] = fetchedAt;
      } catch {
        if (validCardId(raw?.id)) retryCards.set(raw.id, retry);
      }
    }
    for (const id of wanted) retryCards.set(id, retry);
    signal.throwIfAborted();
    await store.save(cards, privateRows, signal);
    signal.throwIfAborted();
    const affected = [...new Set([...changed, ...privateIds])];
    if (affected.length) void notify(affected, firstFetchedAt).catch(() => {});
  }

  async function flush() {
    flushing = true;
    try {
      while (jobs.size) {
        const includeMyListings = [...jobs.values()][0].privateDemand;
        const selected = [...jobs]
          .filter(([, job]) => job.privateDemand === includeMyListings)
          .slice(0, BATCH_SIZE);
        const current = session,
          signal = generation.signal,
          url = base;
        try {
          // Prefer cold cards from the same haul, including cards behind "See all".
          const group = selected.find(([, job]) => job.batchCandidates)?.[1]
            .batchCandidates;
          const related = group && selected.length < BATCH_SIZE
            ? await staleCards(group, url)
            : [];
          signal.throwIfAborted();
          if (deferred) passive.add(deferred);
          for (const id of related.length ? new Set([...related, ...passive]) : passive) {
            if (selected.length === BATCH_SIZE) break;
            passive.delete(id);
            if (jobs.has(id) || (retryCards.get(id) ?? 0) > Date.now()) continue;
            addJob(id, includeMyListings);
            selected.push([id, jobs.get(id)!]);
          }
          if (deferred && selected.some(([id]) => id === deferred))
            await persistDeferred();
          signal.throwIfAborted();
          if (
            current &&
            !current.blocked &&
            current.expiresAt > Date.now() &&
            retryAt <= Date.now()
          ) {
            // An observation or deferred ID can outlive the miss that queued it.
            const missing = await staleCards(
              selected.map(([id]) => id),
              url,
            );
            signal.throwIfAborted();
            if (missing.length)
              await refresh(missing, url, current, signal, includeMyListings);
          }
        } catch {
          if (!signal.aborted) retryAt = Date.now() + 15_000;
        } finally {
          for (const [id, job] of selected) {
            if (jobs.get(id) === job) jobs.delete(id);
            job.resolve();
          }
        }
      }
    } finally {
      flushing = false;
    }
  }

  function enqueue(id: string, privateDemand: boolean, batchCandidates?: string[]) {
    if (
      !session ||
      session.blocked ||
      session.expiresAt <= Date.now() ||
      retryAt > Date.now() ||
      (retryCards.get(id) ?? 0) > Date.now()
    )
      return;
    passive.delete(id);
    return addJob(id, privateDemand, batchCandidates);
  }

  function addJob(id: string, privateDemand: boolean, batchCandidates?: string[]) {
    const existing = jobs.get(id);
    if (existing) {
      existing.privateDemand ||= privateDemand;
      existing.batchCandidates ??= batchCandidates;
      return existing.promise;
    }
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    jobs.set(id, { promise, resolve, privateDemand, batchCandidates });
    if (!flushing && timer === undefined)
      timer = setTimeout(() => {
        timer = undefined;
        void flush().catch(() => {});
      }, 35);
    return promise;
  }

  async function staleCards(ids: string[], url: string) {
    const { freshness } = await policy;
    const records = await store.getCards(ids.map((id) => key(url, id)));
    const now = Date.now();
    return ids.filter((_, index) => {
      const row = records[index];
      return !row || Math.min(row.freshUntil, row.fetchedAt + freshness) <= now;
    });
  }

  async function readCards(
    ids: string[],
    account: string | undefined,
    observed: boolean,
    cacheOnly = false,
    privateDemand = false,
    batchCandidates?: string[],
  ) {
    if (session && session.expiresAt <= Date.now())
      await serialize(async () => {
        if (session && session.expiresAt <= Date.now()) await replace(base);
      });
    if (!base) return {};
    const signal = generation.signal;
    if (observed) {
      if (!session || session.blocked) return {};
      const missing = await staleCards([...new Set(ids)], base);
      signal.throwIfAborted();
      for (const id of missing) {
        if (jobs.has(id)) continue;
        passive.add(id);
        if (passive.size > 500) passive.delete(passive.values().next().value!);
      }
      if (!deferred && passive.size)
        await persistDeferred(passive.values().next().value);
      return {};
    }
    const { retention } = await policy;
    const now = Date.now();
    if (now - lastPrune >= 60 * 60_000) {
      lastPrune = now;
      for (const [id, after] of retryCards)
        if (after <= now) retryCards.delete(id);
      void store.prune(now - retention).catch(() => {});
    }
    const result: Record<string, CardView> = {};
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        let view = await snapshot(id, account);
        signal.throwIfAborted();
        const wantsMine =
          privateDemand &&
          account !== undefined &&
          session?.handle?.toLowerCase() === account &&
          !session.blocked &&
          (!session.scopes || session.scopes.includes("listings")) &&
          view.listings === undefined;
        if (view.stale && !cacheOnly) {
          const pending = enqueue(
            id,
            wantsMine && listingRetryAt <= Date.now(),
            batchCandidates,
          );
          if (wantsMine || !view.card) {
            await pending;
            signal.throwIfAborted();
            view = await snapshot(id, account);
          }
        }
        if (wantsMine && !view.missing && view.listings === undefined) {
          try {
            await privateListings(account);
          } catch (error) {
            // Preserve the independently usable public auction price.
            if (!view.card || signal.aborted) throw error;
          }
          signal.throwIfAborted();
          view = await snapshot(id, account);
        }
        result[id] = view;
      }),
    );
    signal.throwIfAborted();
    return result;
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      !message ||
      typeof message.requestId !== "string"
    )
      return false;
    const options =
      sender.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL("options.html");
    const linkPage =
      sender.frameId === 0 &&
      sender.tab &&
      sender.url?.split(/[?#]/, 1)[0] ===
        chrome.runtime.getURL("link-complete.html");
    const game =
      sender.tab &&
      sender.frameId === 0 &&
      sender.url?.startsWith("https://kosmora.io/");
    if (
      !(
        options &&
        [
          "servicesStatus",
          "servicesRetry",
          "servicesSave",
          "servicesConnect",
          "servicesCopyLink",
          "servicesDisconnect",
          "servicesEraseHistory",
        ].includes(message.op)
      ) &&
      !(linkPage && message.op === "servicesFinishLink") &&
      !(
        game &&
        ["servicesRead", "servicesObserve", "servicesPeek"].includes(message.op)
      )
    )
      return false;
    void ready
      .then(async () => {
        switch (message.op) {
          case "servicesStatus":
            if (session && session.expiresAt <= Date.now())
              await serialize(async () => {
                if (session && session.expiresAt <= Date.now())
                  await replace(base);
              });
            return status();
          case "servicesRetry":
            return serialize(async () => {
              const linked = session;
              if (!linked?.blocked) return status();
              const response = await call(
                base,
                "/v1/me",
                generation.signal,
                linked.token,
              );
              if (response.status === 401) await replace(base);
              else if (response.ok)
                await replace(base, { ...linked, blocked: false });
              else if (response.status !== 403)
                throw new Error("Services is temporarily unavailable.");
              return status();
            });
          case "servicesSave": {
            if (typeof message.base !== "string")
              throw new Error("Invalid Services URL.");
            const next = message.base ? servicesBase(message.base) : "";
            if (next !== base) linking?.abort();
            return serialize(async () => {
              if (next !== base) await replace(next);
              return status();
            });
          }
          case "servicesFinishLink":
            if (
              typeof message.query !== "string" ||
              message.query.length > 1024
            )
              throw new Error("Invalid account-linking callback.");
            return finishCopiedLink(message.query);
          case "servicesConnect":
          case "servicesCopyLink":
            if (typeof message.base !== "string")
              throw new Error("Invalid Services URL.");
            return connect(
              message.base,
              typeof message.inviteCode === "string"
                ? message.inviteCode
                : undefined,
              message.op === "servicesCopyLink",
            );
          case "servicesEraseHistory":
            if (
              typeof message.playerId !== "string" ||
              typeof message.base !== "string"
            )
              throw new Error("Confirm the linked account.");
            await history.erase(message.playerId, message.base);
            return status();
          case "servicesDisconnect":
            linking?.abort();
            return serialize(async () => {
              const previous = session,
                url = base;
              await replace(url);
              if (previous && previous.expiresAt > Date.now()) {
                const response = await call(
                  url,
                  "/v1/disconnect",
                  generation.signal,
                  previous.token,
                  {},
                );
                if (!response.ok && response.status !== 401)
                  throw new Error(
                    "Disconnected locally. Services could not revoke the previous session.",
                  );
              }
              return status();
            });
          default:
            if (
              !Array.isArray(message.ids) ||
              message.ids.length > 500 ||
              !message.ids.every(validCardId)
            )
              throw new Error("Invalid card request.");
            return readCards(
              message.ids,
              typeof message.account === "string" &&
                /^[a-z0-9_]{1,24}$/.test(message.account)
                ? message.account
                : undefined,
              message.op === "servicesObserve",
              message.op === "servicesPeek",
              message.op === "servicesRead" &&
                message.includeMyListings === true,
              message.op === "servicesRead" &&
                Array.isArray(message.batchCandidates) &&
                message.batchCandidates.length <= 500 &&
                message.batchCandidates.every(validCardId)
                ? message.batchCandidates
                : undefined,
            );
        }
      })
      .then(
        (data) => respond({ requestId: message.requestId, ok: true, data }),
        (error) =>
          respond({
            requestId: message.requestId,
            ok: false,
            error: messageOf(error),
          }),
      );
    return true;
  });
  return history;
}
