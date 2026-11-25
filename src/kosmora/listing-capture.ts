import { amount, object, subjectId, uuid } from "./contracts";
import { listingCopyId } from "./my-listings";

export interface ListingConfirmation {
  auctionId: string;
  submittedAt: number;
  copyId?: string;
  subjectId?: string;
  startPrice?: string;
}

export type ListingReceipt = Pick<
  ListingConfirmation,
  "auctionId" | "submittedAt"
>;
export function validReceipt(value: unknown): value is ListingReceipt {
  try {
    const row = object(value);
    uuid(row.auctionId);
    return (
      typeof row.submittedAt === "number" &&
      Number.isSafeInteger(row.submittedAt) &&
      row.submittedAt > 0
    );
  } catch {
    return false;
  }
}

export interface RecordedListing {
  id: string;
  subjectId: string;
  startPrice: string;
  submittedAt: number;
  copyId?: string;
}

export function validRecordedListing(value: unknown): value is RecordedListing {
  try {
    const row = object(value);
    return (
      uuid(row.id) === row.id &&
      subjectId(row.subjectId) === row.subjectId &&
      amount(row.startPrice) === row.startPrice &&
      (row.copyId === undefined || listingCopyId(row.copyId) === row.copyId) &&
      typeof row.submittedAt === "number" &&
      Number.isSafeInteger(row.submittedAt) &&
      row.submittedAt > 0
    );
  } catch {
    return false;
  }
}

export function listingSubjectId(value: unknown): string | undefined {
  try {
    return subjectId(Number.isSafeInteger(value) ? String(value) : value);
  } catch {
    return undefined;
  }
}

export function saleSubjects(value: unknown): Map<string, string> {
  const data = object(value);
  const items = Array.isArray(data.items) ? data.items : [data];
  const result = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const raw of items) {
    try {
      const item = object(raw);
      const subject = listingSubjectId(
        item.subjectId ?? object(item.card).subjectId,
      );
      if (!subject) continue;
      const copies = Array.isArray(item.copies) ? item.copies : [];
      for (const value of [
        item.instanceId,
        item.copy,
        ...copies.map((copy) => copy?.id),
      ]) {
        const id = listingCopyId(value);
        if (!id) continue;
        if (result.has(id) && result.get(id) !== subject) conflicts.add(id);
        result.set(id, subject);
      }
    } catch {
      // Missing mappings can be recovered from the confirmed auction itself.
    }
  }
  for (const id of conflicts) result.delete(id);
  return result;
}

export function listingConfirmations(
  path: string,
  request: unknown,
  response: unknown,
  submittedAt: number,
  subjects: ReadonlyMap<string, string>,
  auctionSubjects: ReadonlyMap<string, string> = new Map(),
): ListingConfirmation[] {
  const result = object(response);
  const batch = path === "/api/market/listings/batch";
  const rows =
    batch && Array.isArray(result.results)
      ? result.results
      : batch
        ? []
        : [result];
  const body = request && typeof request === "object" ? object(request) : {};
  const items = batch && Array.isArray(body.items) ? body.items : [body];
  const submittedSubjects = saleSubjects(body);
  const prices = new Map<string, string>();
  const relistedSubjects = new Map<string, string>();
  for (const raw of items) {
    try {
      const item = object(raw);
      const copy = uuid(item.instanceId).toLowerCase();
      const previous = listingCopyId(item.relistOf);
      const subject = previous && auctionSubjects.get(previous);
      if (subject) relistedSubjects.set(copy, subject);
      prices.set(copy, amount(item.startPrice));
    } catch {
      // An auction detail can supply the price for a relist or unknown body.
    }
  }
  return rows.flatMap((raw) => {
    try {
      const row = object(raw);
      if (row.ok === false || (batch && row.ok !== true)) return [];
      const auctionId = uuid(row.auctionId).toLowerCase();
      const copyId = listingCopyId(row.instanceId ?? body.instanceId);
      const reportedSubject =
        row.subjectId ?? (row.card && object(row.card).subjectId);
      const subject =
        listingSubjectId(reportedSubject) ??
        (copyId &&
          (submittedSubjects.get(copyId) ??
            subjects.get(copyId) ??
            relistedSubjects.get(copyId)));
      let price = copyId && prices.get(copyId);
      const reportedPrice =
        row.startPrice ?? (!batch ? body.startPrice : undefined);
      if (reportedPrice !== undefined) {
        try {
          price = amount(reportedPrice);
        } catch {
          // A successful post still confirms the listing without a usable price.
        }
      }
      return [
        {
          auctionId,
          submittedAt,
          copyId,
          subjectId: subject,
          startPrice: price,
        },
      ];
    } catch {
      return [];
    }
  });
}
