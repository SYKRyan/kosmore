import { it, expect } from "vitest";
import { isRequest, isTabRequest } from "../../src/shared/messages";
it("rejects arbitrary operations, invalid routing arguments, and uncorrelated messages", () => {
  expect(
    isRequest({ op: "fetch", requestId: "a", url: "https://elsewhere.test" }),
  ).toBe(false);
  expect(isRequest({ op: "sessions" })).toBe(false);
  expect(
    isRequest({ op: "albums", requestId: "a", tabId: -1, accountKey: "alice" }),
  ).toBe(false);
  expect(
    isTabRequest({ op: "listAlbums", requestId: "a", accountKey: "alice" }),
  ).toBe(true);
  expect(isTabRequest({ op: "add", requestId: "a" })).toBe(false);
});
