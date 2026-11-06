import { beforeEach, expect, it } from "vitest";
import { profilePlayer } from "../../src/kosmora/profile";
import { profileFixture } from "../fixtures/profile";
import { defaults, parseSettings } from "../../src/shared/settings";
import {
  createBackup,
  parseBackup,
  serializeBackup,
} from "../../src/shared/backup";

beforeEach(() => {
  history.replaceState(null, "", "/u/batu");
  document.body.innerHTML = profileFixture();
});
it("binds a rendered profile to its route and account hint", () => {
  expect(profilePlayer()).toMatchObject({
    handle: "batu",
    key: "batu",
    accountHint: "fixtureplayer",
  });
  history.replaceState(null, "", "/u/BaTu?lang=fr");
  expect(profilePlayer()?.key).toBe("batu");
});
it("rejects missing, hidden, stale and non-profile identities", () => {
  for (const route of [
    "/social?f=batu",
    "/u/OtherPlayer",
    "/u/batu/collection",
    "/u/bad-handle",
  ]) {
    history.replaceState(null, "", route);
    expect(profilePlayer()).toBeNull();
  }
  history.replaceState(null, "", "/u/batu");
  document.querySelector(".pf-banner")!.setAttribute("hidden", "");
  expect(profilePlayer()).toBeNull();
});
it("does not trust a foreign account-navigation link", () => {
  document
    .querySelector(".rail a")!
    .setAttribute("href", "https://elsewhere.example/u/OtherPlayer");
  expect(profilePlayer()?.accountHint).toBeUndefined();
});
it("defaults old installations and backs up profile display preferences", () => {
  expect(parseSettings({ schemaVersion: 1 })).toMatchObject({
    profileRemindersEnabled: true,
    profileRemindersPinned: false,
  });
  const settings = {
    ...defaults(),
    profileRemindersEnabled: false,
    profileRemindersPinned: true,
  };
  const backup = createBackup({ "kosmore.settings": settings }, "1.0.0");
  expect(parseBackup(serializeBackup(backup)).settings).toEqual(settings);
});
