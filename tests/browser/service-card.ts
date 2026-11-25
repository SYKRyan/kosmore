import type { Worker } from "@playwright/test";
import type { ServicesCard } from "../../src/shared/services";

export async function mockServiceCard(worker: Worker, card: ServicesCard) {
  return worker.evaluateHandle((card) => {
    const listener: Parameters<
      typeof chrome.runtime.onMessage.addListener
    >[0] = (message, _sender, reply) => {
      if (message.op !== "servicesRead" || !message.ids.includes(card.id)) return;
      reply({
        requestId: message.requestId,
        ok: true,
        data: {
          [card.id]: { card, until: Date.now() + 300_000, stale: false, ...(message.includeMyListings && { listings: [] }) },
        },
      });
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, card);
}
