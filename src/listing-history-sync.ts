import type { SaleChange } from "./shared/sale-status";
import {
  validRecordedListing,
  type RecordedListing,
  type ListingReceipt,
} from "./kosmora/listing-capture";
import type { PersonalListing } from "./kosmora/my-listings";
import { ListingHistoryStore, type HistoryPage } from "./listing-history-store";

export interface HistoryLink {
  scope: string;
  handle: string;
  signal: AbortSignal;
  request(path: string, method?: string, body?: unknown): Promise<Response>;
}
const path = "/v1/me/listing-history";
const alarm = "kosmore.listing-history";
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
function parsePage(input: HistoryPage) {
  if (
    !input ||
    !integer(input.generation) ||
    !integer(input.cursor) ||
    !integer(input.erasedAt) ||
    typeof input.hasMore !== "boolean" ||
    !Array.isArray(input.records) ||
    !input.records.every(validRecordedListing)
  )
    throw new Error("Services returned invalid listing history.");
  return input;
}

export class ListingHistorySync {
  private store = new ListingHistoryStore();
  private work: Promise<void> = Promise.resolve();
  private queued = new Map<string, boolean>();
  private retry = new Map<string, number>();

  constructor(private link: () => Promise<HistoryLink | undefined>) {}

  install() {
    const setup = async () => {
      if (chrome.alarms && !(await chrome.alarms.get(alarm)))
        await chrome.alarms.create(alarm, { periodInMinutes: 5 });
    };
    void setup().catch(() => {});
    chrome.runtime.onStartup?.addListener(() => {
      void setup().catch(() => {});
      this.schedule();
    });
    chrome.alarms?.onAlarm.addListener((tick) => {
      if (tick.name === alarm)
        void chrome.tabs.query({ url: "https://kosmora.io/*" }).then((tabs) => {
          if (tabs.length) this.schedule();
        });
    });
  }

  private serial<T>(fn: () => Promise<T>) {
    const next = this.work.then(fn);
    this.work = next.then(
      () => {},
      () => {},
    );
    return next;
  }

  schedule(handle?: string) {
    void this.link()
      .then((link) => {
        if (!link || (handle && handle !== link.handle)) return;
        const queued = this.queued.get(link.scope);
        this.queued.set(link.scope, !!queued || handle === undefined);
        if (queued !== undefined) return;
        return this.serial(async () => {
          const pull = this.queued.get(link.scope)!;
          this.queued.delete(link.scope);
          if (
            (this.retry.get(link.scope) ?? 0) > Date.now() ||
            link.signal.aborted
          )
            return;
          await this.sync(link, pull);
        });
      })
      .catch(() => {}); // A durable cursor and queue are retried by the next alarm.
  }

  importVerified(handle: string) {
    return this.store.importVerified(handle);
  }

  async knownSubjects(handle: string, changes: SaleChange[]) {
    const missing = changes.filter(
      (row) => !row.subjectId && (row.copyId || row.relistOf),
    );
    if (!missing.length) return [];
    const link = await this.link();
    const matches = link?.handle === handle;
    const identities = await this.store.knownSubjects(
      handle,
      matches ? link.scope : undefined,
      missing,
    );
    if (matches) link.signal.throwIfAborted();
    return identities;
  }

  async latest(handle: string, subject: string) {
    const link = await this.link();
    const matches = link?.handle === handle;
    const result = await this.store.latest(
      handle,
      matches ? link.scope : undefined,
      subject,
    );
    if (matches) link.signal.throwIfAborted();
    if (!result) return;
    const { id, subjectId, startPrice, submittedAt, copyId } = result;
    return { id, subjectId, startPrice, submittedAt, copyId };
  }

  async record(
    handle: string,
    records: RecordedListing[],
    receipts: ListingReceipt[] = [],
  ) {
    const link = await this.link().catch(() => undefined);
    await this.store.capture(
      handle,
      records,
      receipts,
      link?.handle === handle ? link.scope : undefined,
    );
    if (records.length) this.schedule(handle);
  }

  async observe(handle: string, rows: PersonalListing[]) {
    const resolved = await this.store.resolveReceipts(handle, rows);
    if (resolved.length) this.schedule(handle);
    return resolved;
  }

  private async checked(
    link: HistoryLink,
    route: string,
    method?: string,
    body?: unknown,
  ) {
    link.signal.throwIfAborted();
    const response = await link.request(route, method, body);
    link.signal.throwIfAborted();
    if (!response.ok) {
      const delay = Number(response.headers.get("Retry-After"));
      if (
        response.status === 429 ||
        response.status === 503 ||
        response.status === 404
      )
        this.retry.set(
          link.scope,
          Date.now() + Math.max(300, Number.isFinite(delay) ? delay : 0) * 1000,
        );
      throw new Error(
        "Listing history is unavailable (HTTP " + response.status + ").",
      );
    }
    return response;
  }

  private async changed(handle: string) {
    const tabs = await chrome.tabs.query({ url: "https://kosmora.io/*" });
    await Promise.allSettled(
      tabs
        .filter((t) => t.id !== undefined)
        .map((t) =>
          chrome.tabs.sendMessage(
            t.id!,
            { op: "confirmedListingsChanged", account: handle },
            { frameId: 0 },
          ),
        ),
    );
  }

  private async pull(link: HistoryLink) {
    let current = await this.store.state(link.scope);
    let changed = false;
    do {
      const params = new URLSearchParams({ after: String(current.cursor) });
      if (current.generation !== undefined)
        params.set("generation", String(current.generation));
      const response = await this.checked(link, path + "/changes?" + params);
      const page = parsePage(await response.json());
      if (
        page.hasMore &&
        (!page.records.length ||
          (page.generation === current.generation &&
            page.cursor <= current.cursor))
      )
        throw new Error("Listing history cursor did not advance.");
      link.signal.throwIfAborted();
      changed =
        (await this.store.apply(link.scope, link.handle, page)) || changed;
      current = await this.store.state(link.scope);
      if (!page.hasMore) break;
    } while (!link.signal.aborted);
    if (changed) await this.changed(link.handle);
    return current;
  }

  private async sync(link: HistoryLink, pull: boolean) {
    let current = await this.store.state(link.scope);
    if (pull || current.generation === undefined)
      current = await this.pull(link);
    while (!link.signal.aborted) {
      const pending = await this.store.pending(link.handle, current.uploaded);
      if (!pending.length) return;
      const records = pending
        .filter(
          (r) =>
            r.submittedAt > current.erasedAt &&
            !(current.erasedAt && r.legacy) &&
            r.subjectId !== "0" &&
            r.startPrice.length <= 50,
        )
        .map(({ id, subjectId, copyId, startPrice, submittedAt }) => ({
          id,
          subjectId,
          copyId,
          startPrice,
          submittedAt,
        }));
      if (records.length)
        await this.checked(link, path + "/batch", "POST", {
          generation: current.generation,
          records,
        });
      const seq = pending[pending.length - 1].seq;
      link.signal.throwIfAborted();
      await this.store.acknowledge(link.scope, current.generation!, seq);
      current.uploaded = seq;
    }
  }

  erase(expectedPlayer: string, expectedBase: string) {
    return this.serial(async () => {
      const link = await this.link();
      if (
        !link ||
        link.scope !== JSON.stringify([expectedBase, expectedPlayer])
      )
        throw new Error("The linked Services account changed.");
      let info = await this.store.state(link.scope);
      if (info.generation === undefined) info = await this.pull(link);
      const response = await this.checked(
        link,
        path + "?generation=" + info.generation,
        "DELETE",
      );
      const reset = await response.json();
      if (
        !integer(reset.generation) ||
        reset.generation <= info.generation! ||
        !integer(reset.erasedAt)
      )
        throw new Error("Services could not confirm erasure.");
      await this.store.apply(link.scope, link.handle, {
        ...reset,
        records: [],
        hasMore: false,
        cursor: 0,
      });
      await this.changed(link.handle);
    });
  }
}
