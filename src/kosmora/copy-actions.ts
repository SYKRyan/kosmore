import type { OwnedCopy } from "../shared/types";
import { subjectId, uuid } from "./contracts";

export type TransferAction = "gift" | "trade";

export function transferProblem(copy: OwnedCopy, action: TransferAction) {
  if (copy.lockedInAlbum)
    return "Remove this copy from its album or tome first.";
  if (copy.state !== "available" || copy.auctionId)
    return "This copy is currently unavailable.";
  if (action === "gift" && copy.exclusive)
    return "Exclusive copies cannot be gifted.";
  if (action === "trade" && copy.inTrade)
    return "This copy is already offered in a trade.";
}

export function tradePath(copy: OwnedCopy) {
  return `/trades/new?give=${uuid(copy.id)}&card=${subjectId(copy.subjectId)}`;
}
