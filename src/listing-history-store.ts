import type { ListingReceipt } from "./kosmora/listing-capture";
import type { PersonalListing } from "./kosmora/my-listings";
import {
  validRecordedListing,
  type RecordedListing,
} from "./kosmora/listing-capture";
import { LISTING_PRICE_KEY } from "./shared/listing-cache";
import type { SaleChange } from "./shared/sale-status";

export interface HistoryState {
  generation?: number;
  cursor: number;
  uploaded: number;
  erasedAt: number;
}
export interface HistoryPage {
  generation: number;
  cursor: number;
  erasedAt: number;
  hasMore: boolean;
  records: RecordedListing[];
}
type Stored = RecordedListing & {
  owner: string;
  seq: number;
  legacy?: boolean;
};
const initial = (): HistoryState => ({ cursor: 0, uploaded: 0, erasedAt: 0 });
const max = Number.MAX_SAFE_INTEGER;
const localOwner = (handle: string) => "local:" + handle;

function value<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class ListingHistoryStore {
  private database?: Promise<IDBDatabase>;
  private imports = new Map<string, Promise<void>>();

  private open() {
    return (this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("kosmore.confirmed-listings", 2);
      open.onupgradeneeded = (event) => {
        if (event.oldVersion < 1) {
          const rows = open.result.createObjectStore("records", {
            keyPath: "seq",
            autoIncrement: true,
          });
          rows.createIndex("auction", ["owner", "id"], { unique: true });
          rows.createIndex("latest", [
            "owner",
            "subjectId",
            "submittedAt",
            "id",
          ]);
          rows.createIndex("outbox", ["owner", "seq"]);
          open.result.createObjectStore("state");
        }
        open
          .transaction!.objectStore("records")
          .createIndex("copy", ["owner", "copyId", "submittedAt"]);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    }).catch((error) => {
      this.database = undefined;
      throw error;
    }));
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    work: (rows: IDBObjectStore, state: IDBObjectStore) => Promise<T>,
  ) {
    const tx = (await this.open()).transaction(["records", "state"], mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? new Error("Listing history transaction aborted."));
    });
    try {
      const result = await work(
        tx.objectStore("records"),
        tx.objectStore("state"),
      );
      await done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw error;
    }
  }

  private async insert(
    rows: IDBObjectStore,
    owner: string,
    records: RecordedListing[],
    legacy = false,
    epoch?: string,
  ) {
    for (const record of records) {
      const id = record.id.toLowerCase();
      if (!(await value(rows.index("auction").getKey([owner, id]))))
        await value(
          rows.add({
            id,
            subjectId: record.subjectId,
            startPrice: record.startPrice,
            submittedAt: record.submittedAt,
            copyId: record.copyId,
            owner,
            legacy,
            epoch,
          }),
        );
    }
  }

  capture(
    handle: string,
    records: RecordedListing[],
    receipts: ListingReceipt[],
    scope?: string,
  ) {
    // The same durable row is the price index entry and the upload queue item.
    return this.transaction("readwrite", async (rows, state) => {
      const linkState: HistoryState | undefined = scope
        ? await value(state.get(scope))
        : undefined;
      const epoch =
        linkState?.generation !== undefined
          ? JSON.stringify([scope, linkState.generation])
          : undefined;
      await this.insert(rows, localOwner(handle), records, false, epoch);
      if (!receipts.length) return;
      const key = "receipts:" + handle;
      const pending: Map<string, number> =
        (await value(state.get(key))) ?? new Map();
      for (const receipt of receipts)
        if (!pending.has(receipt.auctionId))
          pending.set(receipt.auctionId, receipt.submittedAt);
      await value(state.put(pending, key));
    });
  }

  resolveReceipts(handle: string, observed: PersonalListing[]) {
    return this.transaction("readwrite", async (rows, state) => {
      const key = "receipts:" + handle;
      const pending: Map<string, number> | undefined = await value(
        state.get(key),
      );
      const records: RecordedListing[] = [];
      if (!pending?.size) return records;
      for (const listing of observed) {
        const id = listing.id.toLowerCase(),
          submittedAt = pending.get(id);
        if (!submittedAt) continue;
        pending.delete(id);
        records.push({
          id,
          submittedAt,
          subjectId: listing.subjectId,
          startPrice: listing.startPrice,
          copyId: listing.copyId,
        });
      }
      if (records.length) {
        await this.insert(rows, localOwner(handle), records);
        await value(state.put(pending, key));
      }
      return records;
    });
  }

  importVerified(handle: string) {
    const previous = this.imports.get(handle);
    if (previous) return previous;
    const task = this.importLegacy(handle).catch((error) => {
      this.imports.delete(handle);
      throw error;
    });
    this.imports.set(handle, task);
    return task;
  }

  private async importLegacy(handle: string) {
    const marker = "import:" + handle;
    if (
      await this.transaction("readonly", (_, state) => value(state.get(marker)))
    )
      return;
    const data = await chrome.storage.local.get(null);
    const prefix = "kosmore.listingRecord." + handle + ".";
    const records: RecordedListing[] = [];
    function collect(subjectId: string, item: unknown) {
      if (!item || typeof item !== "object") return;
      const record = { ...item, subjectId };
      if (validRecordedListing(record)) records.push(record);
    }
    for (const [key, raw] of Object.entries(data)) {
      if (!key.startsWith(prefix) || !raw || typeof raw !== "object") continue;
      const subject = key.slice(prefix.length);
      if ("latest" in raw) collect(subject, raw.latest);
      if ("listings" in raw && Array.isArray(raw.listings))
        for (const row of raw.listings) collect(subject, row);
    }
    const old = data[LISTING_PRICE_KEY] as
      { entries?: Record<string, { listing?: unknown }> } | undefined;
    for (const [key, raw] of Object.entries(old?.entries ?? {}))
      if (key.startsWith(handle + ":"))
        collect(key.slice(handle.length + 1), raw?.listing);
    await this.transaction("readwrite", async (rows, state) => {
      if (await value(state.get(marker))) return;
      await this.insert(rows, localOwner(handle), records, true);
      await value(state.put(true, marker));
    });
  }

  async knownSubjects(
    handle: string,
    scope: string | undefined,
    changes: SaleChange[],
  ) {
    await this.importVerified(handle);
    return this.transaction("readonly", async (rows, state) => {
      const cutoff: number = (await value(state.get("cutoff:" + handle))) ?? 0;
      const owners = [localOwner(handle), ...(scope ? [scope] : [])];
      const identities: { id: string; subjectId: string; copyId?: string }[] =
        [];
      for (const { auctionId, relistOf, copyId } of changes) {
        for (const owner of owners) {
          let record: Stored | undefined;
          if (relistOf)
            record = await value(rows.index("auction").get([owner, relistOf]));
          if ((!record || record.submittedAt <= cutoff) && copyId) {
            const range = IDBKeyRange.bound(
              [owner, copyId, cutoff + 1],
              [owner, copyId, max],
            );
            record = (await value(rows.index("copy").openCursor(range, "prev")))
              ?.value;
          }
          if (record && record.submittedAt > cutoff) {
            identities.push({
              id: auctionId,
              subjectId: record.subjectId,
              copyId: copyId ?? record.copyId,
            });
            break;
          }
        }
      }
      return identities;
    });
  }

  async latest(handle: string, scope: string | undefined, subject: string) {
    await this.importVerified(handle);
    return this.transaction("readonly", async (rows, state) => {
      const cutoff: number = (await value(state.get("cutoff:" + handle))) ?? 0;
      const candidates = await Promise.all(
        [localOwner(handle), ...(scope ? [scope] : [])].map(async (owner) => {
          const range = IDBKeyRange.bound(
            [owner, subject, cutoff + 1],
            [owner, subject, max, []],
          );
          return (await value(rows.index("latest").openCursor(range, "prev")))
            ?.value as Stored | undefined;
        }),
      );
      return candidates
        .filter((r): r is Stored => !!r)
        .sort(
          (a, b) =>
            b.submittedAt - a.submittedAt ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        )[0];
    });
  }

  state(scope: string): Promise<HistoryState> {
    return this.transaction(
      "readonly",
      async (_, state) => (await value(state.get(scope))) ?? initial(),
    );
  }

  pending(handle: string, after: number): Promise<Stored[]> {
    return this.transaction("readonly", (rows) =>
      value(
        rows
          .index("outbox")
          .getAll(
            IDBKeyRange.bound(
              [localOwner(handle), after + 1],
              [localOwner(handle), max],
            ),
            40,
          ),
      ),
    );
  }

  acknowledge(scope: string, generation: number, seq: number) {
    return this.transaction("readwrite", async (_, state) => {
      const current: HistoryState | undefined = await value(state.get(scope));
      if (current?.generation === generation)
        await value(
          state.put(
            { ...current, uploaded: Math.max(current.uploaded, seq) },
            scope,
          ),
        );
    });
  }

  apply(scope: string, handle: string, page: HistoryPage) {
    return this.transaction("readwrite", async (rows, state) => {
      const current: HistoryState =
        (await value(state.get(scope))) ?? initial();
      if (
        current.generation !== undefined &&
        page.generation < current.generation
      )
        return false;
      const reset = current.generation !== page.generation;
      if (!reset && current.cursor > page.cursor) return false;
      if (reset && page.erasedAt) {
        // Remove downloaded rows and invalidate local submissions erased on another browser.
        const index = rows.index("outbox");
        for (const owner of [scope, localOwner(handle)]) {
          const range = IDBKeyRange.bound([owner, 0], [owner, max]);
          const request = index.openCursor(range);
          await new Promise<void>((resolve, reject) => {
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const cursor = request.result;
              if (!cursor) {
                resolve();
                return;
              }
              if (
                owner === scope ||
                cursor.value.legacy ||
                (current.generation !== undefined &&
                  cursor.value.epoch ===
                    JSON.stringify([scope, current.generation])) ||
                cursor.value.submittedAt <= page.erasedAt
              )
                cursor.delete();
              cursor.continue();
            };
          });
        }
        await value(state.put(true, "import:" + handle));
        const receiptsKey = "receipts:" + handle;
        const receipts: Map<string, number> | undefined = await value(
          state.get(receiptsKey),
        );
        if (receipts) {
          for (const [id, time] of receipts)
            if (time <= page.erasedAt) receipts.delete(id);
          await value(state.put(receipts, receiptsKey));
        }
        const cutoff = (await value(state.get("cutoff:" + handle))) ?? 0;
        await value(
          state.put(Math.max(cutoff, page.erasedAt), "cutoff:" + handle),
        );
      }
      await this.insert(rows, scope, page.records);
      for (const record of page.records) {
        const local: Stored | undefined = await value(
          rows.index("auction").get([localOwner(handle), record.id]),
        );
        if (
          local &&
          (local.submittedAt !== record.submittedAt ||
            local.startPrice !== record.startPrice ||
            local.subjectId !== record.subjectId)
        )
          await value(
            rows.put({
              ...local,
              subjectId: record.subjectId,
              startPrice: record.startPrice,
              submittedAt: record.submittedAt,
            }),
          );
      }
      await value(
        state.put(
          {
            ...current,
            generation: page.generation,
            cursor: page.cursor,
            erasedAt: page.erasedAt,
          },
          scope,
        ),
      );
      return !!page.records.length || (reset && !!page.erasedAt);
    });
  }
}
