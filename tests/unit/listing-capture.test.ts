import { expect, it } from "vitest";
import {
  listingConfirmations,
  saleSubjects,
} from "../../src/kosmora/listing-capture";
import { auction } from "../fixtures/auctions";

it("matches successful batch results by instance ID even when the response changes order", () => {
  const first = auction(1).id,
    second = auction(2).id,
    failed = auction(3).id;
  const subjects = saleSubjects({
    items: [
      { instanceId: first, subjectId: "42" },
      { instanceId: second, card: { subjectId: "46" } },
      { instanceId: failed, subjectId: "47" },
    ],
  });
  const body = {
    items: [
      { instanceId: first, startPrice: "1000000" },
      { instanceId: second, startPrice: "2000000" },
      { instanceId: failed, startPrice: "3000000" },
    ],
  };
  expect(
    listingConfirmations(
      "/api/market/listings/batch",
      body,
      {
        results: [
          { instanceId: second, ok: true, auctionId: auction(12).id },
          { instanceId: failed, ok: false, auctionId: auction(13).id },
          { instanceId: first, ok: true, auctionId: auction(11).id },
        ],
      },
      100,
      subjects,
    ),
  ).toEqual([
    {
      auctionId: auction(12).id,
      copyId: second,
      subjectId: "46",
      startPrice: "2000000",
      submittedAt: 100,
    },
    {
      auctionId: auction(11).id,
      copyId: first,
      subjectId: "42",
      startPrice: "1000000",
      submittedAt: 100,
    },
  ]);
});

it("leaves relist details for verification against the new auction ID", () => {
  const auctionId = auction(2).id;
  expect(
    listingConfirmations(
      `/api/auctions/${auction(1).id}/relist`,
      { expectedFee: "1" },
      { auctionId },
      100,
      new Map(),
    ),
  ).toMatchObject([{ auctionId, submittedAt: 100 }]);
});
