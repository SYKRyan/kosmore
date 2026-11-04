import type { Account, Album } from "./types";
export type Request =
  | { requestId: string; op: "sessions" }
  | { requestId: string; op: "albums"; tabId: number; accountKey: string }
  | { requestId: string; op: "openOptions" };
export type TabRequest =
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
    (["sessions", "openOptions"].includes(r.op) ||
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
      (r.op === "listAlbums" && /^[a-z0-9_]{1,24}$/.test(r.accountKey)))
  );
}
export async function request<T extends Session[] | Album[] | null>(
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
