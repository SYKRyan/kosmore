import { amount, object, subjectId, uuid } from "./contracts";
import { listingCopyId } from "./my-listings";

export interface ListingConfirmation {
  auctionId: string;
  submittedAt: number;
  copyId?: string;
  relistOf?: string;
  subjectId?: string;
  startPrice?: string;
}

export type ListingReceipt = Pick<
  ListingConfirmation,
  "auctionId" | "submittedAt" | "startPrice" | "copyId"
>;
export function validReceipt(value: unknown): value is ListingReceipt {
  try {
    const row = object(value);
    uuid(row.auctionId);
    return (
      typeof row.submittedAt === "number" &&
      Number.isSafeInteger(row.submittedAt) &&
      row.submittedAt > 0 &&
      (row.startPrice === undefined ||
        amount(row.startPrice) === row.startPrice) &&
      (row.copyId === undefined || listingCopyId(row.copyId) === row.copyId)
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

type SubmittedItem = Pick<
  ListingConfirmation,
  "subjectId" | "copyId" | "relistOf" | "startPrice"
>;

export function listingSubmission(
  path: string,
  request: unknown,
  subjects: ReadonlyMap<string, string>,
  auctionSubjects: ReadonlyMap<string, string> = new Map(),
) {
  const batch = path === "/api/market/listings/batch";
  const body =
    request && typeof request === "object" && !Array.isArray(request)
      ? object(request)
      : {};
  const items = new Map<string, SubmittedItem>();
  const previous = path.endsWith("/relist")
    ? listingCopyId(path.split("/")[3])
    : undefined;
  function capture(raw: unknown): SubmittedItem {
    const item =
      raw && typeof raw === "object" && !Array.isArray(raw) ? object(raw) : {};
    const copyId = listingCopyId(item.instanceId);
    const relistOf = previous ?? listingCopyId(item.relistOf);
    const card =
      item.card && typeof item.card === "object" && !Array.isArray(item.card)
        ? object(item.card)
        : undefined;
    const subject =
      listingSubjectId(item.subjectId ?? card?.subjectId) ??
      (copyId && subjects.get(copyId)) ??
      (relistOf && auctionSubjects.get(relistOf));
    const startPrice =
      typeof item.startPrice === "string" && /^\d+$/.test(item.startPrice)
        ? item.startPrice
        : undefined;
    return {
      copyId,
      subjectId: subject,
      startPrice,
      ...(relistOf && { relistOf }),
    };
  }
  if (batch && Array.isArray(body.items))
    for (const raw of body.items) {
      const item = capture(raw);
      if (item.copyId) items.set(item.copyId, item);
    }
  return { batch, items, single: batch ? undefined : capture(body) };
}

export function listingConfirmations(
  submission: ReturnType<typeof listingSubmission>,
  response: unknown,
  submittedAt: number,
  subjects: ReadonlyMap<string, string>,
  auctionSubjects: ReadonlyMap<string, string>,
): ListingConfirmation[] {
  const result = object(response);
  const { batch, items, single } = submission;
  const rows = batch
    ? Array.isArray(result.results)
      ? result.results
      : []
    : [result];
  return rows.flatMap((raw) => {
    try {
      const row = object(raw);
      if (row.ok === false || (batch && row.ok !== true)) return [];
      const auctionId = uuid(row.auctionId).toLowerCase();
      const copyId = listingCopyId(row.instanceId) ?? single?.copyId;
      const item =
        single && (!single.copyId || single.copyId === copyId)
          ? single
          : copyId
            ? items.get(copyId)
            : undefined;
      const reportedSubject =
        row.subjectId ?? (row.card && object(row.card).subjectId);
      const subject =
        listingSubjectId(reportedSubject) ??
        item?.subjectId ??
        (copyId && subjects.get(copyId)) ??
        (item?.relistOf && auctionSubjects.get(item.relistOf));
      let price = item?.startPrice;
      const reportedPrice = row.startPrice;
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
          ...(item?.relistOf && { relistOf: item.relistOf }),
          subjectId: subject,
          startPrice: price,
        },
      ];
    } catch {
      return [];
    }
  });
}
