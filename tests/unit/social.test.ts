import { beforeEach, expect, it } from "vitest";
import { selectedSocialFriend } from "../../src/kosmora/social";
import { socialPanel } from "../fixtures/social";
beforeEach(() => {
  history.replaceState(null, "", "/social?f=batu");
  document.body.innerHTML = `<aside class="rail"><a href="/u/FixturePlayer">Me</a></aside><div class="sb-side">${socialPanel()}</div>`;
});
it("identifies the selected friend from matching native panel links", () => {
  expect(selectedSocialFriend()).toMatchObject({
    handle: "batu",
    key: "batu",
    accountHint: "fixtureplayer",
  });
});
it("supports the desktop default friend when the URL has no explicit selection", () => {
  history.replaceState(null, "", "/social");
  expect(selectedSocialFriend()?.key).toBe("batu");
});
it("does not bind a stale panel to a new URL selection or social subpage", () => {
  history.replaceState(null, "", "/social?f=FriendB");
  expect(selectedSocialFriend()).toBeNull();
  history.replaceState(null, "", "/social?v=give&f=batu");
  expect(selectedSocialFriend()).toBeNull();
  history.replaceState(null, "", "/collection");
  expect(selectedSocialFriend()).toBeNull();
});
it("rejects conflicting or foreign profile links rather than using a history row", () => {
  document
    .querySelector('.sb-links a[href="/u/batu"]')!
    .setAttribute("href", "/u/another");
  document
    .querySelector(".sb-page")!
    .insertAdjacentHTML("beforeend", '<a href="/u/batu">Historical player</a>');
  expect(selectedSocialFriend()).toBeNull();
  document
    .querySelector('.sb-links a[href="/u/another"]')!
    .setAttribute("href", "https://elsewhere.example/u/batu");
  expect(selectedSocialFriend()).toBeNull();
});
