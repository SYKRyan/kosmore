import {
  validRecordedListing,
  type RecordedListing,
} from "../kosmora/listing-capture";
import type { Account } from "./types";
import {
  listingCopyId,
  SAVED_LISTING_LIMIT,
  validListingLimits,
  validListingMetadata,
  type ListingLimits,
  type ListingMetadata,
} from "../kosmora/my-listings";
import { isPopupLayoutChange, type PopupLayoutChange } from "./popup-layout";
export type Request =
  | {
      requestId: string;
      op: "listingCache" | "listingInvalidate" | "listingSavedPrice";
      accountKey: string;
      subjectId: string;
    }
  | {
      requestId: string;
      op: "listingHistory";
      accountKey: string;
      subjectId: string;
      mode: "more" | "refresh";
      limits?: ListingLimits;
    }
  | {
      requestId: string;
      op: "listingRecord";
      accountKey: string;
      subjectId: string;
      records: RecordedListing[];
    }
  | {
      requestId: string;
      op: "listingMetadata";
      accountKey: string;
      subjectId: string;
      metadata: [auctionId: string, ListingMetadata][];
    }
  | { requestId: string; op: "listingCancel"; target: string }
  | { requestId: string; op: "popupState" }
  | { requestId: string; op: "popupLayout"; change: PopupLayoutChange }
  | { requestId: string; op: "friendPopupState" }
  | { requestId: string; op: "friendPopupLayout"; change: PopupLayoutChange }
  | { requestId: string; op: "sessions" }
  | {
      requestId: string;
      op: "albums" | "families";
      tabId: number;
      accountKey: string;
    }
  | { requestId: string; op: "openOptions"; section?: "stat-boxes" };
export type TabRequest =
  | {
      requestId: string;
      op: "readListingBatch";
      accountKey: string;
      limits: ListingLimits;
    }
  | { requestId: string; op: "cancelListingBatch"; target: string }
  | { requestId: string; op: "listingCacheChanged"; accountKey: string }
  | { requestId: string; op: "session" }
  | {
      requestId: string;
      op: "listAlbums" | "listFamilies";
      accountKey: string;
    };
export interface Session {
  tabId: number;
  account: Account;
}
export type Result<T> =
  | { requestId: string; ok: true; data: T }
  | { requestId: string; ok: false; error: string };
export const validId = (x: unknown): x is string =>
  typeof x === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(x);
export function isRequest(x: unknown): x is Request {
  if (!x || typeof x !== "object") return false;
  const r = x as Request;
  return (
    validId(r.requestId) &&
    (([
      "listingCache",
      "listingSavedPrice",
      "listingInvalidate",
      "listingHistory",
      "listingRecord",
      "listingMetadata",
    ].includes(r.op) &&
      "accountKey" in r &&
      "subjectId" in r &&
      /^[a-z0-9_]{1,24}$/.test(r.accountKey) &&
      typeof r.subjectId === "string" &&
      /^\d+$/.test(r.subjectId) &&
      (r.op !== "listingRecord" ||
        (Array.isArray(r.records) &&
          r.records.length <= 500 &&
          r.records.every(validRecordedListing))) &&
      (r.op !== "listingMetadata" ||
        (Array.isArray(r.metadata) &&
          r.metadata.length <= SAVED_LISTING_LIMIT &&
          r.metadata.every(
            (pair) =>
              Array.isArray(pair) &&
              pair.length === 2 &&
              typeof pair[0] === "string" &&
              listingCopyId(pair[0]) === pair[0] &&
              validListingMetadata(pair[1]),
          ))) &&
      (r.op !== "listingHistory" ||
        (["more", "refresh"].includes(r.mode) &&
          (r.limits === undefined || validListingLimits(r.limits))))) ||
      (r.op === "listingCancel" && validId(r.target)) ||
      (r.op === "openOptions" &&
        (r.section === undefined || r.section === "stat-boxes")) ||
      ["sessions", "popupState", "friendPopupState"].includes(r.op) ||
      (r.op === "popupLayout" && isPopupLayoutChange(r.change)) ||
      (r.op === "friendPopupLayout" &&
        isPopupLayoutChange(r.change, { minWidth: 240, minHeight: 160 })) ||
      ((r.op === "albums" || r.op === "families") &&
        Number.isInteger(r.tabId) &&
        r.tabId >= 0 &&
        /^[a-z0-9_]{1,24}$/.test(r.accountKey)))
  );
}
export function isTabRequest(x: unknown): x is TabRequest {
  if (!x || typeof x !== "object") return false;
  const r = x as TabRequest;
  return (
    validId(r.requestId) &&
    (r.op === "session" ||
      (r.op === "cancelListingBatch" && validId(r.target)) ||
      (r.op === "listingCacheChanged" &&
        /^[a-z0-9_]{1,24}$/.test(r.accountKey)) ||
      (r.op === "readListingBatch" &&
        /^[a-z0-9_]{1,24}$/.test(r.accountKey) &&
        validListingLimits(r.limits)) ||
      ((r.op === "listAlbums" || r.op === "listFamilies") &&
        /^[a-z0-9_]{1,24}$/.test(r.accountKey)))
  );
}
export async function request<T>(
  message: Omit<Request, "requestId"> & Record<string, unknown>,
): Promise<T> {
  const requestId = crypto.randomUUID();
  const r = (await chrome.runtime.sendMessage({
    ...message,
    requestId,
  })) as Result<T>;
  if (!r || r.requestId !== requestId || !r.ok)
    throw new Error(
      r && !r.ok ? r.error : "KosMore could not contact the game tab.",
    );
  return r.data;
}
