import { expect, it } from "vitest";
import {
  listingConfirmations,
  listingSubmission,
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
  const submission = listingSubmission(
    "/api/market/listings/batch",
    body,
    subjects,
  );
  subjects.clear(); // The selection can change while the POST is in flight.
  expect(
    listingConfirmations(
      submission,
      {
        results: [
          { instanceId: second, ok: true, auctionId: auction(12).id },
          { instanceId: failed, ok: false, auctionId: auction(13).id },
          { instanceId: first, ok: true, auctionId: auction(11).id },
        ],
      },
      100,
      subjects,
      new Map(),
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
      listingSubmission(
        `/api/auctions/${auction(1).id}/relist`,
        { expectedFee: "1" },
        new Map(),
      ),
      { auctionId },
      100,
      new Map(),
      new Map(),
    ),
  ).toMatchObject([{ auctionId, submittedAt: 100, relistOf: auction(1).id }]);
});

it("matches a successful Relist All row to its previous auction by the submitted copy", () => {
  const copy = auction(1).id;
  const oldAuction = auction(2).id;
  const newAuction = auction(3).id;
  expect(
    listingConfirmations(
      listingSubmission(
        "/api/market/listings/batch",
        {
          items: [
            { instanceId: copy, relistOf: oldAuction, startPrice: "1500000" },
          ],
        },
        new Map(),
        new Map([[oldAuction, "42"]]),
      ),
      { results: [{ ok: true, instanceId: copy, auctionId: newAuction }] },
      100,
      new Map(),
      new Map(),
    ),
  ).toEqual([
    {
      auctionId: newAuction,
      relistOf: oldAuction,
      copyId: copy,
      subjectId: "42",
      startPrice: "1500000",
      submittedAt: 100,
    },
  ]);
});
