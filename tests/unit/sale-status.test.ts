import { expect, it } from "vitest";
import {
  localSaleStatus,
  updateSaleChanges,
  type SaleChange,
} from "../../src/shared/sale-status";
import { auction } from "../fixtures/auctions";

it("replays confirmed changes against the private snapshot and yields to a newer refresh", () => {
  const now = Date.now();
  const id = auction(1).id;
  const list: SaleChange = {
    auctionId: id,
    at: now - 20,
    kind: "listed",
    subjectId: "42",
  };
  const cancel: SaleChange = { auctionId: id, at: now - 10, kind: "canceled" };
  const changes = updateSaleChanges({}, [cancel, list, list], []);
  expect(localSaleStatus(changes, "42", { at: now - 30, count: 1 })).toBe(true);
  expect(localSaleStatus(changes, "42", { at: now - 15, count: 1 })).toBe(
    false,
  );
  expect(localSaleStatus(changes, "42", { at: now - 15, count: 2 })).toBe(true);
  expect(localSaleStatus(changes, "42", { at: now, count: 2 })).toBeUndefined();
  expect(localSaleStatus(changes, "43")).toBeUndefined();
});

it("matches a late auction identity and respects the exact copies in a native read", () => {
  const now = Date.now(),
    id = auction(2).id;
  const changes = updateSaleChanges(
    {},
    [{ auctionId: id, at: now, kind: "canceled" }],
    [{ id, subjectId: "42" }],
  );
  expect(
    localSaleStatus(changes, "42", {
      at: now - 1,
      count: 1,
      auctionIds: new Set([auction(1).id]),
    }),
  ).toBe(true);
  expect(
    localSaleStatus(changes, "42", {
      at: now - 1,
      count: 1,
      auctionIds: new Set([id]),
    }),
  ).toBe(false);
});
