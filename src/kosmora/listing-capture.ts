import { amount, object, subjectId, uuid } from "./contracts";
import { listingCopyId } from "./my-listings";
import type { Finish } from "../shared/types";

export interface ListingConfirmation {
  finish?: Finish;
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
  finish?: Finish;
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
      (row.finish === undefined || ["plain", "veil", "fullart"].includes(String(row.finish))) &&
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

function reportedFinish(row: Record<string, unknown>, subject?: string): Finish | undefined {
  if (row.fullArt) return "fullart";
  if (row.veil === true) return "veil";
  if (subject && row.key === subject) return "plain";
  if (subject && row.key === subject + ".v") return "veil";
  if (subject && row.key === subject + ".f") return "fullart";
  if (row.veil === false) return "plain";
}

export function saleSubjects(value: unknown, finishes?: Map<string, Finish>): Map<string, string> {
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
      const finish = reportedFinish(item, subject);
      const remember = (value: unknown, copyFinish = finish) => {
        const id = listingCopyId(value);
        if (!id) return;
        if (result.has(id) && result.get(id) !== subject) conflicts.add(id);
        result.set(id, subject);
        if (copyFinish) finishes?.set(id, copyFinish);
      };
      remember(item.instanceId);
      remember(item.copy);
      for (const copy of copies)
        if (copy && typeof copy === "object") remember(copy.id, reportedFinish(copy, subject) ?? finish);
    } catch {
      // Missing mappings can be recovered from the confirmed auction itself.
    }
  }
  for (const id of conflicts) {
    result.delete(id);
    finishes?.delete(id);
  }
  return result;
}

type SubmittedItem = Pick<
  ListingConfirmation,
  "subjectId" | "copyId" | "relistOf" | "startPrice" | "finish"
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
    const finish = reportedFinish(item, subject);
    return {
      copyId,
      subjectId: subject,
      ...(finish && { finish }),
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
  finishes?: ReadonlyMap<string, Finish>,
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
      const finish = reportedFinish(row, subject) ?? item?.finish ?? (copyId ? finishes?.get(copyId) : undefined);
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
          ...(finish && { finish }),
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
