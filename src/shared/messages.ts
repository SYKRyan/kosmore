import type { Account } from "./types";
import { validListingLimits, type ListingLimits } from "../kosmora/my-listings";
import { isPopupLayoutChange, type PopupLayoutChange } from "./popup-layout";
export type Request =
  | {
      requestId: string;
      op: "listingCache" | "listingLatest" | "listingInvalidate";
      accountKey: string;
      subjectId: string;
    }
  | {
      requestId: string;
      op: "listingHistory";
      accountKey: string;
      subjectId: string;
      mode: "initial" | "more" | "refresh";
      limits?: ListingLimits;
    }
  | { requestId: string; op: "listingCancel"; target: string }
  | { requestId: string; op: "popupState" }
  | { requestId: string; op: "popupLayout"; change: PopupLayoutChange }
  | { requestId: string; op: "friendPopupState" }
  | { requestId: string; op: "friendPopupLayout"; change: PopupLayoutChange }
  | { requestId: string; op: "sessions" }
  | { requestId: string; op: "albums"; tabId: number; accountKey: string }
  | { requestId: string; op: "openOptions" };
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
  | { requestId: string; op: "listAlbums"; accountKey: string };
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
      "listingLatest",
      "listingInvalidate",
      "listingHistory",
    ].includes(r.op) &&
      "accountKey" in r &&
      "subjectId" in r &&
      /^[a-z0-9_]{1,24}$/.test(r.accountKey) &&
      typeof r.subjectId === "string" &&
      /^\d+$/.test(r.subjectId) &&
      (r.op !== "listingHistory" ||
        (["initial", "more", "refresh"].includes(r.mode) &&
          (r.limits === undefined || validListingLimits(r.limits))))) ||
      (r.op === "listingCancel" && validId(r.target)) ||
      ["sessions", "openOptions", "popupState", "friendPopupState"].includes(
        r.op,
      ) ||
      (r.op === "popupLayout" && isPopupLayoutChange(r.change)) ||
      (r.op === "friendPopupLayout" &&
        isPopupLayoutChange(r.change, { minWidth: 240, minHeight: 160 })) ||
      (r.op === "albums" &&
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
      (r.op === "listAlbums" && /^[a-z0-9_]{1,24}$/.test(r.accountKey)))
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
