import { subjectId, uuid } from "./contracts";
import type { OwnedCopy } from "../shared/types";

export function sellPath(copy: OwnedCopy): string {
  if (copy.state !== "available")
    throw new Error(
      "This copy is not available to sell. Choose another owned copy.",
    );
  return `/market/sell?subject=${subjectId(copy.subjectId)}&instance=${uuid(copy.id)}`;
}
