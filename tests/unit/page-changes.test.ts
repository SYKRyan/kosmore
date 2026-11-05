import { expect, it, vi } from "vitest";
import { observePage, type PageChanges } from "../../src/content/page-changes";

it("shares mutation batches, scopes inserted content, and ignores overlay insertions", async () => {
  document.body.innerHTML = '<main><div id="grid"></div></main>';
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  const first = vi.fn<(changes: PageChanges) => void>();
  const second = vi.fn<(changes: PageChanges) => void>();
  const stopFirst = observePage(first),
    stopSecond = observePage(second);
  try {
    const grid = document.querySelector("#grid")!;
    const card = document.createElement("article");
    grid.append(card);
    await Promise.resolve();
    frame!(0);
    frame = undefined;
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(first.mock.calls[0][0]);
    expect(first.mock.calls[0][0].roots).toEqual([card]);
    const overlay = document.createElement("span");
    overlay.setAttribute("data-kosmore-card-overlays", "");
    card.append(overlay);
    await Promise.resolve();
    expect(frame).toBeUndefined();
    overlay.remove();
    await Promise.resolve();
    // An externally removed host still gives its owner a chance to restore it.
    expect(frame).toBeDefined();
    frame!(0);
  } finally {
    stopFirst();
    stopSecond();
    vi.unstubAllGlobals();
  }
});
