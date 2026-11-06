import { beforeEach, expect, it } from "vitest";
import { tradeSurface } from "../../src/kosmora/trading";

beforeEach(() => {
  history.replaceState(null, "", "/trades/new?friend=Pnltssjake");
  document.body.innerHTML = `<main><div class="sx-new-trade"><header><h1>New trade<span class="sx-flow-with"><span aria-hidden="true" class="avatar">PN</span>Pnltssjake</span></h1></header><ol class="sx-steps"></ol><div data-testid="trade-theirs-filters"></div></div></main>`;
});
it("reads the player handle without the native avatar's fallback initials", () => {
  history.replaceState(null, "", "/trades/new");
  expect(tradeSurface()).toMatchObject({
    handle: "Pnltssjake",
    key: "pnltssjake",
  });
});
it("uses the friend route parameter when it is available", () => {
  document.querySelector(".sx-flow-with")!.innerHTML =
    '<span aria-hidden="true">PN</span>PNLTSSJAKE';
  expect(tradeSurface()).toMatchObject({
    handle: "Pnltssjake",
    key: "pnltssjake",
  });
});
it("follows in-place player changes when the route still names the previous player", () => {
  document.querySelector(".sx-flow-with")!.innerHTML =
    '<span aria-hidden="true">OT</span>Other';
  expect(tradeSurface()).toMatchObject({ handle: "Other", key: "other" });
});
it("does not show a stale route's reminders on the friend-selection step", () => {
  document.querySelector(".sx-flow-with")!.remove();
  expect(tradeSurface()).toBeNull();
});
it("supports an avatar image and either card-selection step without changing the saved reminder key", () => {
  document.querySelector(".avatar")!.innerHTML =
    '<img alt="Pnltssjake" src="/avatar.webp">';
  document
    .querySelector('[data-testid="trade-theirs-filters"]')!
    .setAttribute("data-testid", "trade-mine-filters");
  expect(tradeSurface()).toMatchObject({
    handle: "Pnltssjake",
    key: "pnltssjake",
    filters: document.querySelector('[data-testid="trade-mine-filters"]'),
  });
});
