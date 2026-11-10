import { expect, it, vi } from "vitest";
import { CardOverlays } from "../../src/content/card-overlays";
import {
  CardSignalProvider,
  type CardSignals,
} from "../../src/content/card-signals";
import { OVERLAY_ATTR } from "../../src/kosmora/dom";
import { defaults } from "../../src/shared/settings";
import type { KosmoraClient } from "../../src/shared/types";
import { face } from "../fixtures/data";

it("continues the recap queue immediately, yields to interactive reads, and gives the next recap its own pause", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
    },
  );
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  history.replaceState(null, "", "/packs/open");
  const showRecap = (...ids: string[]) => {
    document.body.innerHTML = `<div class="ko-summary"><ul class="ko-grid">${ids.map((id) => `<li>${face(id)}</li>`).join("")}</ul></div>`;
  };
  const signals: CardSignals = {
    onSale: true,
    saleHistory: false,
    activeAuctions: false,
    interestedFriends: 0,
    quest: false,
  };
  const pending = new Map<
    string,
    { finish: () => void; ready: () => void; signal: AbortSignal }
  >();
  const get = vi.spyOn(CardSignalProvider.prototype, "get").mockImplementation(
    (id, _settings, _finish, _progress, _priority, signal, ready) =>
      new Promise((resolve) => {
        pending.set(id, {
          finish: () => resolve(signals),
          ready: ready!,
          signal: signal!,
        });
      }),
  );
  const hasInteractiveReads = vi.fn(() => false);
  const overlays = new CardOverlays({
    hasInteractiveReads,
  } as unknown as KosmoraClient);
  const started = () => get.mock.calls.map(([id]) => id);
  try {
    showRecap("60", "61", "62");
    overlays.start();
    overlays.setSettings({ ...defaults(), showOnSaleOverlay: true });
    await vi.advanceTimersByTimeAsync(49);
    expect(started()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(started()).toEqual(["60"]);

    pending.get("60")!.ready();
    expect(started()).toEqual(["60", "61"]);
    pending.get("60")!.finish();

    hasInteractiveReads.mockReturnValue(true);
    pending.get("61")!.finish();
    await vi.advanceTimersByTimeAsync(50);
    expect(started()).toEqual(["60", "61"]);
    hasInteractiveReads.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(started()).toEqual(["60", "61", "62"]);

    pending.get("62")!.ready(); // Its price is still pending.
    const oldCard = document.querySelector("li:last-child .kc-article")!;
    showRecap("70");
    await Promise.resolve(); // Let the page observer schedule the recap scan.
    await vi.advanceTimersByTimeAsync(0);
    expect(pending.get("62")!.signal.aborted).toBe(true);
    pending.get("62")!.finish();
    await vi.advanceTimersByTimeAsync(49);
    expect(oldCard.querySelector(`[${OVERLAY_ATTR}]`)).toBeNull();
    expect(started()).toEqual(["60", "61", "62"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(started()).toEqual(["60", "61", "62", "70"]);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
