import { it, expect } from "vitest";
import { parseSettings } from "../../src/shared/settings";
import { ALBUM_A, ALBUM_B } from "../fixtures/data";
it("keeps account pins isolated and ordered while discarding corrupt identifiers", () => {
  const s = parseSettings({
    schemaVersion: 1,
    enabled: false,
    hoverDelayMs: 350,
    pinnedAlbums: { alice: [ALBUM_B, ALBUM_A, ALBUM_B, "bad"], bob: [ALBUM_A] },
  });
  expect(s.pinnedAlbums.alice).toEqual([ALBUM_B, ALBUM_A]);
  expect(s.pinnedAlbums.bob).toEqual([ALBUM_A]);
  expect(s.enabled).toBe(false);
});
it("handles unknown schemas and bounds the delay", () => {
  expect(parseSettings({ schemaVersion: 2 }).hoverDelayMs).toBe(300);
  expect(
    parseSettings({ schemaVersion: 1, hoverDelayMs: 0 }).hoverDelayMs,
  ).toBe(100);
});
