import { it, expect } from "vitest";
import { sellPath } from "../../src/kosmora/selling";
import { COPY_A } from "../fixtures/data";
const copy = {
  id: COPY_A,
  subjectId: "00042",
  state: "available",
  variant: { veil: false, fullArt: false },
};
it("opens the native form with the exact selected owned copy", () => {
  expect(sellPath(copy)).toBe(`/market/sell?subject=42&instance=${COPY_A}`);
});
it("rejects unavailable or malformed copy targets", () => {
  expect(() => sellPath({ ...copy, state: "listed" })).toThrow("not available");
  expect(() => sellPath({ ...copy, id: "arbitrary-target" })).toThrow();
});
