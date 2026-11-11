import { isRequest, type Result } from "./shared/messages";
import { ListingCacheService } from "./shared/listing-cache";
import {
  validListingBatch,
  type ListingBatch,
  type ListingLimits,
} from "./kosmora/my-listings";
import { messageOf } from "./shared/types";

export function installListingBackground() {
  const service = new ListingCacheService(
    chrome.storage.local,
    chrome.storage.session,
  );
  const consumers = new Map<string, AbortController>();
  const canceled = new Set<string>();
  chrome.tabs.onRemoved.addListener((tab) => {
    for (const [key, controller] of consumers)
      if (key.startsWith(`${tab}:`)) {
        controller.abort();
        consumers.delete(key);
      }
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      !sender.tab ||
      sender.tab.id === undefined ||
      sender.frameId !== 0 ||
      !sender.url?.startsWith("https://kosmora.io/") ||
      !isRequest(message) ||
      !message.op.startsWith("listing")
    )
      return false;
    const tabId = sender.tab.id;
    if (message.op === "listingCancel") {
      const key = `${tabId}:${message.target}`;
      const controller = consumers.get(key);
      if (controller) controller.abort();
      else {
        canceled.add(key);
        setTimeout(() => canceled.delete(key), 30_000);
      }
      respond({ requestId: message.requestId, ok: true, data: null });
      return false;
    }
    if (!("accountKey" in message) || !("subjectId" in message)) return false;
    const key = `${tabId}:${message.requestId}`,
      controller = new AbortController();
    consumers.set(key, controller);
    if (canceled.delete(key)) controller.abort();
    const read = async (limits: ListingLimits, signal: AbortSignal) => {
      signal.throwIfAborted();
      const requestId = crypto.randomUUID();
      const cancel = () => {
        void chrome.tabs
          .sendMessage(tabId, {
            requestId: crypto.randomUUID(),
            op: "cancelListingBatch",
            target: requestId,
          })
          .catch(() => {});
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const result = (await chrome.tabs.sendMessage(tabId, {
          requestId,
          op: "readListingBatch",
          accountKey: message.accountKey,
          limits,
        })) as Result<ListingBatch> & { status?: number; retryAt?: number };
        signal.throwIfAborted();
        if (!result || !result.ok)
          throw Object.assign(
            new Error(
              result && !result.ok
                ? result.error
                : "Your listing history is unavailable.",
            ),
            { status: result?.status, retryAt: result?.retryAt },
          );
        if (!validListingBatch(result.data))
          throw new Error("Your listing history is unavailable.");
        return result.data;
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    };
    const changed = async () => {
      const tabs = await chrome.tabs.query({ url: "https://kosmora.io/*" });
      await Promise.allSettled(
        tabs
          .filter((tab) => tab.id !== undefined)
          .map((tab) =>
            chrome.tabs.sendMessage(tab.id!, {
              requestId: crypto.randomUUID(),
              op: "listingCacheChanged",
              accountKey: message.accountKey,
            }),
          ),
      );
    };
    void (async () => {
      controller.signal.throwIfAborted();
      if (message.op === "listingCache")
        return service.tracked(message.accountKey, message.subjectId);
      if (message.op === "listingSavedPrice")
        return (await service.tracked(message.accountKey, message.subjectId))
          .listings[0];
      if (message.op === "listingMetadata") {
        const updated = await service.attachMetadata(
          message.accountKey,
          message.subjectId,
          new Map(message.metadata),
          controller.signal,
        );
        if (updated) await changed();
        return null;
      }
      if (message.op === "listingHistory") {
        const result = await service.history(
          message.accountKey,
          message.subjectId,
          message.mode,
          read,
          controller.signal,
          message.limits,
        );
        await changed();
        return result;
      }
      if (
        message.op === "listingRecord" ||
        message.op === "listingInvalidate"
      ) {
        if (message.op === "listingRecord")
          await service.record(message.accountKey, message.records);
        await service.invalidate(message.accountKey);
        await changed();
      }
      return null;
    })()
      .then(
        (data) => respond({ requestId: message.requestId, ok: true, data }),
        (error) =>
          respond({
            requestId: message.requestId,
            ok: false,
            error: messageOf(error),
            status: error?.status,
            retryAt: error?.retryAt,
          }),
      )
      .finally(() => consumers.delete(key));
    return true;
  });
}
