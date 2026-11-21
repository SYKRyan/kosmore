import type { ListingHistorySync } from "./listing-history-sync";
import { isRequest } from "./shared/messages";
import { ListingCacheService } from "./shared/listing-cache";
import { messageOf } from "./shared/types";

export function installListingBackground(history: ListingHistorySync) {
  const service = new ListingCacheService(
    chrome.storage.local,
    chrome.storage.session,
  );
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab?.id === undefined ||
      sender.frameId !== 0 ||
      !sender.url?.startsWith("https://kosmora.io/") ||
      !isRequest(message) ||
      !(
        message.op === "listingCache" ||
        message.op === "listingSavedPrice" ||
        message.op === "listingAccountVerified" ||
        message.op === "listingRecord" ||
        message.op === "listingObserved"
      )
    )
      return false;
    void (async () => {
      const { accountKey, subjectId } = message;
      if (message.op === "listingAccountVerified")
        return history.importVerified(accountKey);
      if (message.op === "listingSavedPrice")
        return history.latest(accountKey, subjectId);
      if (message.op === "listingCache")
        return service.tracked(accountKey, subjectId);
      if (message.op === "listingRecord") {
        await history.record(accountKey, message.records, message.receipts);
        await service.record(accountKey, message.records);
      } else if (message.op === "listingObserved") {
        const resolved = await history.observe(accountKey, message.rows);
        if (resolved.length) await service.record(accountKey, resolved);
        await service.observe(accountKey, message.rows);
      }
      const tabs = await chrome.tabs.query({ url: "https://kosmora.io/*" });
      await Promise.allSettled(
        tabs.flatMap((tab) =>
          tab.id === undefined
            ? []
            : [
                chrome.tabs.sendMessage(
                  tab.id,
                  {
                    requestId: crypto.randomUUID(),
                    op: "listingCacheChanged",
                    accountKey,
                  },
                  { frameId: 0 },
                ),
              ],
        ),
      );
      return null;
    })().then(
      (data) => respond({ requestId: message.requestId, ok: true, data }),
      (error) =>
        respond({
          requestId: message.requestId,
          ok: false,
          error: messageOf(error),
        }),
    );
    return true;
  });
}
