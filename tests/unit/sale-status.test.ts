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

it("respects a native correction even if an empty Services cache is read afterward", () => {
  const now = Date.now(),
    id = auction(3).id;
  const changes = { [id]: { listed: now - 10, subjectId: "42" } };
  const service = { at: now, count: 0 };
  expect(localSaleStatus(changes, "42", service, now)).toBe(true);
  expect(
    localSaleStatus(changes, "42", service, now, {
      at: now - 5,
      count: 0,
      auctionIds: new Set(),
    }),
  ).toBeUndefined();
});

it("carries the copy and card identity from the previous auction to a confirmed relist", () => {
  const at = Date.now();
  const prior = auction(1).id,
    relisted = auction(2).id,
    copyId = auction(3).id;
  const changes = updateSaleChanges(
    { [prior]: { listed: at - 10, subjectId: "42", copyId } },
    [{ kind: "listed", at, auctionId: relisted, relistOf: prior }],
    [],
  );
  expect(changes[relisted]).toMatchObject({
    listed: at,
    subjectId: "42",
    copyId,
  });
});
