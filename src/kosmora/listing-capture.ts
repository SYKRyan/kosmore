import { amount, object, subjectId, uuid } from "./contracts";

export interface ListingConfirmation {
  auctionId: string;
  submittedAt: number;
  subjectId?: string;
  startPrice?: string;
}

export interface RecordedListing {
  id: string;
  subjectId: string;
  startPrice: string;
  submittedAt: number;
}

export function validRecordedListing(value: unknown): value is RecordedListing {
  try {
    const row = object(value);
    return (
      uuid(row.id) === row.id &&
      subjectId(row.subjectId) === row.subjectId &&
      amount(row.startPrice) === row.startPrice &&
      typeof row.submittedAt === "number" &&
      Number.isSafeInteger(row.submittedAt) &&
      row.submittedAt > 0
    );
  } catch {
    return false;
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
      const id = uuid(item.instanceId).toLowerCase();
      const subject = subjectId(item.subjectId ?? object(item.card).subjectId);
      if (result.has(id) && result.get(id) !== subject) conflicts.add(id);
      result.set(id, subject);
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
  const prices = new Map<string, string>();
  for (const raw of items) {
    try {
      const item = object(raw);
      prices.set(uuid(item.instanceId).toLowerCase(), amount(item.startPrice));
    } catch {
      // An auction detail can supply the price for a relist or unknown body.
    }
  }
  return rows.flatMap((raw) => {
    try {
      const row = object(raw);
      if (row.ok === false || (batch && row.ok !== true)) return [];
      const auctionId = uuid(row.auctionId).toLowerCase();
      const instance = batch ? row.instanceId : body.instanceId;
      const instanceId =
        typeof instance === "string" ? instance.toLowerCase() : "";
      return [
        {
          auctionId,
          submittedAt,
          subjectId: subjects.get(instanceId),
          startPrice: prices.get(instanceId),
        },
      ];
    } catch {
      return [];
    }
  });
}
